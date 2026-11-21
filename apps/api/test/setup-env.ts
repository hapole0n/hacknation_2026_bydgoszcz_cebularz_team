// Tests never reach the internet: the sandbox is served from disk (see fixture-fetch.ts).
// The database is the local compose Postgres; take the repo-root .env if there is one, else the compose defaults.
try {
  process.loadEnvFile(new URL('../../../.env', import.meta.url));
} catch {
  /* no .env */
}
process.env.DATABASE_URL ??= 'postgresql://olcys:olcys@localhost:5432/olcys';
process.env.SANDBOX_BASE_URL = 'http://sandbox-web';
delete process.env.GITHUB_TOKEN;
