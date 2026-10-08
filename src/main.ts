import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { env } from './config/env.js';
import { configureApp } from './setup-app.js';

async function bootstrap() {
  const config = env();
  const app = await NestFactory.create(AppModule);
  configureApp(app);
  await app.listen(config.PORT);
  Logger.log(
    `ContaBeni API en http://localhost:${config.PORT}/api/v1 (docs en /docs)`,
    'Bootstrap',
  );
}

void bootstrap();
