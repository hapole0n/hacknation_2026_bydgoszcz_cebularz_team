import { defineConfig } from 'prisma/config';

// Keys live only in the repo-root .env; absent in Docker, where compose injects the environment.
try {
  process.loadEnvFile(new URL('../../.env', import.meta.url));
} catch {
  /* no root .env */
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: process.env.DATABASE_URL ?? '' },
});
