import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

// Keys live only in the repo-root .env; absent in Docker, where compose injects the environment.
try {
  process.loadEnvFile(new URL('../../../.env', import.meta.url));
} catch {
  /* no root .env */
}

const app = await NestFactory.create(AppModule);
app.setGlobalPrefix('api');
app.enableShutdownHooks();
await app.listen(process.env.API_PORT ?? 3000);
