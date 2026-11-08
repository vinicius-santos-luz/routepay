import type { Metadata } from "next";
import Link from "next/link";
import { Brand } from "@/components/brand";
import { GoogleSignIn } from "@/modules/identity/presentation/google-sign-in";
import { readAuthEnvironment } from "@/server/auth/environment";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Entrar",
  robots: { index: false, follow: false },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  let enabled = false;
  try {
    enabled = readAuthEnvironment(process.env).google !== null;
  } catch {
    /* Fail closed; the institutional page remains public. */
  }
  const params = await searchParams;
  const unavailable = !enabled || params.error !== undefined;

  return (
    <div className="mx-auto max-w-7xl px-6 py-8 lg:px-10">
      <Brand />
      <main
        id="main-content"
        tabIndex={-1}
        className="mx-auto max-w-md py-16 sm:py-24"
      >
        <p className="eyebrow mb-4 text-emerald">Acesso ao RoutePay</p>
        <h1 className="text-4xl font-semibold tracking-tight">
          Seu espaço de trabalho.
        </h1>
        <p className="mt-5 text-sm leading-relaxed text-muted">
          Entre com sua conta Google. O acesso às organizações será gerenciado
          pelo RoutePay.
        </p>
        <div className="mt-8 rounded-2xl border border-line bg-white p-6">
          <GoogleSignIn enabled={enabled} />
          {unavailable && (
            <p
              role="status"
              className="mt-5 text-sm leading-relaxed text-muted"
            >
              O login está indisponível no momento. Nenhum acesso à área
              protegida foi concedido.
            </p>
          )}
        </div>
        <p className="mt-6 text-xs leading-relaxed text-muted">
          Autenticação em preparação. Pagamentos e operações financeiras
          permanecem indisponíveis.
        </p>
        <Link
          href="/"
          className="mt-7 inline-block text-sm font-medium text-emerald"
        >
          Voltar à página institucional
        </Link>
      </main>
    </div>
  );
}
