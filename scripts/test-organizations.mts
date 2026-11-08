import { createServer, createConnection } from "node:net";
import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import { mkdir, chmod, writeFile, lstat, realpath } from "node:fs/promises";
import { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve, extname } from "node:path";

// No dotenv loader, environment URLs, shell invocation, migration runner or remote target.
const root = fileURLToPath(new URL("../", import.meta.url));
const directory = resolve(root, "test-results/org-integration");
const socketPath = resolve(directory, "credentials.sock");

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      return nextResolve(
        pathToFileURL(resolve(root, "src", specifier.slice(2)) + ".ts").href,
        context,
      );
    }
    if (
      specifier.startsWith(".") &&
      context.parentURL?.startsWith(
        pathToFileURL(resolve(root, "src") + "/").href,
      ) &&
      !extname(specifier)
    ) {
      return nextResolve(
        new URL(specifier + ".ts", context.parentURL).href,
        context,
      );
    }
    return nextResolve(specifier, context);
  },
});

async function password(role: string) {
  if (!process.stdin.isTTY || !process.stdout.isTTY)
    throw new Error("tty-required");
  const muted = new Writable({
    write(_chunk, _encoding, callback) {
      callback();
    },
  });
  const prompt = createInterface({
    input: process.stdin,
    output: muted,
    terminal: true,
    historySize: 0,
  });
  process.stdout.write(
    `Senha EXCLUSIVA de testes para ${role} em 127.0.0.1:5433 (oculta): `,
  );
  try {
    const value = await prompt.question("");
    if (!value || value.length > 1024) throw new Error("invalid-input");
    return value;
  } finally {
    prompt.close();
    process.stdout.write("\n");
  }
}

async function provide() {
  const parent = await lstat(directory);
  const socket = await lstat(socketPath);
  if (
    !(await realpath(directory)).startsWith((await realpath(root)) + "/") ||
    !parent.isDirectory() ||
    parent.isSymbolicLink() ||
    (parent.mode & 0o077) !== 0 ||
    !socket.isSocket() ||
    socket.isSymbolicLink() ||
    (socket.mode & 0o077) !== 0 ||
    parent.uid !== process.getuid?.() ||
    socket.uid !== process.getuid?.()
  )
    throw new Error("unsafe-channel");
  const app = await password("routepay_app");
  const migrator = await password("routepay_migrator");
  const socketClient = createConnection(socketPath);
  await new Promise<void>((resolvePromise, reject) => {
    socketClient.once("connect", resolvePromise);
    socketClient.once("error", reject);
  });
  socketClient.end(JSON.stringify({ app, migrator }));
  await new Promise<void>((resolvePromise, reject) => {
    socketClient.once("close", () => resolvePromise());
    socketClient.once("error", reject);
  });
  process.stdout.write(
    "Credenciais enviadas apenas ao executor local em memória. Nenhum valor foi registrado.\n",
  );
}

async function listen() {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const info = await lstat(directory);
  if (
    !(await realpath(directory)).startsWith((await realpath(root)) + "/") ||
    !info.isDirectory() ||
    info.isSymbolicLink() ||
    info.uid !== process.getuid?.()
  )
    throw new Error("unsafe-directory");
  await chmod(directory, 0o700);
  const received = Promise.withResolvers<{ app: string; migrator: string }>();
  void received.promise.catch(() => {});
  let consumed = false;
  const server = createServer((client) => {
    if (consumed) {
      client.destroy();
      return;
    }
    consumed = true;
    const chunks: Buffer[] = [];
    let size = 0;
    client.setTimeout(30000, () => {
      client.destroy();
      received.reject(new Error("channel-timeout"));
    });
    client.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > 16384) {
        client.destroy();
        received.reject(new Error("oversize"));
        return;
      }
      chunks.push(chunk);
    });
    client.on("error", () => received.reject(new Error("channel-error")));
    client.on("end", () => {
      try {
        const value: unknown = JSON.parse(
          Buffer.concat(chunks).toString("utf8"),
        );
        if (
          !value ||
          typeof value !== "object" ||
          !("app" in value) ||
          !("migrator" in value) ||
          typeof value.app !== "string" ||
          typeof value.migrator !== "string" ||
          !value.app ||
          !value.migrator
        )
          throw new Error("invalid-payload");
        received.resolve({ app: value.app, migrator: value.migrator });
      } catch {
        received.reject(new Error("invalid-payload"));
      } finally {
        for (const chunk of chunks) chunk.fill(0);
        client.end();
      }
    });
  });
  server.on("error", () => received.reject(new Error("channel-error")));
  await new Promise<void>((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(socketPath, resolvePromise);
  });
  await chmod(socketPath, 0o600);
  process.stdout.write(
    "Aguardando credenciais exclusivas do cluster 18/routepay_test por canal Unix local privado.\n",
  );
  process.stdout.write(
    "Em outro terminal WSL, neste repositório: node --experimental-transform-types --conditions=react-server scripts/test-organizations.mts --provide-credentials\n",
  );
  const deadline = setTimeout(
    () => received.reject(new Error("credentials-timeout")),
    15 * 60 * 1000,
  );
  try {
    const credentials = await received.promise;
    server.close();
    clearTimeout(deadline);
    const { runOrganizationIntegration } =
      await import("../tests/integration/organizations.ts");
    const report = await runOrganizationIntegration(credentials).finally(() => {
      credentials.app = "";
      credentials.migrator = "";
    });
    const reportPath = resolve(directory, `report-${report.runId}.json`);
    await writeFile(reportPath, JSON.stringify(report, null, 2) + "\n", {
      mode: 0o600,
      flag: "wx",
    });
    process.stdout.write(`Relatório sanitizado: ${reportPath}\n`);
    process.stdout.write(JSON.stringify(report, null, 2) + "\n");
    process.exitCode = report.conclusion === "APROVADA" ? 0 : 1;
  } finally {
    clearTimeout(deadline);
    if (server.listening) server.close();
  }
}

async function main() {
  const mode = process.argv[2];
  if (mode === "--provide-credentials") return provide();
  if (mode === "--listen") return listen();
  if (mode === "--self-check") {
    const suite = await import("../tests/integration/organizations.ts");
    if (typeof suite.runOrganizationIntegration !== "function")
      throw new Error("invalid-suite");
    process.stdout.write(
      "Executor e módulos reais carregados; nenhuma credencial ou conexão utilizada.\n",
    );
    return;
  }
  process.stdout.write(
    "Use --listen, --provide-credentials ou --self-check. Alvo único: 127.0.0.1:5433/routepay_dev (18/routepay_test).\n",
  );
}

main().catch(() => {
  // Never print an exception, URL, assertion payload or credential value.
  process.stderr.write(
    "Executor interrompido por falha de configuração, canal protegido ou carregamento. Nenhum segredo foi registrado.\n",
  );
  process.exitCode = 1;
});
