/** Synthetic values used only by tests. They never configure the running app. */
export function authEnvironmentFixture() {
  return {
    DATABASE_URL: "postgresql://routepay_app@127.0.0.1:5432/routepay_dev",
    BETTER_AUTH_URL: "http://localhost:3000",
    BETTER_AUTH_SECRET: "unit-test-only-secret-never-used-by-the-app",
  };
}

export function migrationEnvironmentFixture() {
  return {
    MIGRATION_DATABASE_URL:
      "postgresql://routepay_migrator@127.0.0.1:5432/routepay_dev",
  };
}
