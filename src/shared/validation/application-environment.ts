export type ApplicationEnvironment = "local" | "test";

export function parseApplicationEnvironment(
  value: string | undefined,
): ApplicationEnvironment {
  if (value === undefined) return "local";
  if (value === "local" || value === "test") return value;

  throw new Error("APP_ENV inválido. Nesta etapa, utilize local ou test.");
}
