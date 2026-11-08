import "server-only";
import { betterAuth } from "better-auth";
import { getAuthPool } from "@/server/db/pool";
import { readAuthEnvironment } from "./environment";
import { buildAuthOptions } from "./options";

function createAuth() {
  const environment = readAuthEnvironment(process.env);
  return betterAuth(
    buildAuthOptions(environment, getAuthPool(environment.database)),
  );
}

let instance: ReturnType<typeof createAuth> | undefined;

/** Lazy: builds never need credentials and missing config never enables stateless auth. */
export function getAuth() {
  instance ??= createAuth();
  return instance;
}
