import { ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { corsOrigins } from './config/env.js';

export interface SetupOptions {
  swagger?: boolean;
}

/** Configuración compartida entre bootstrap (main.ts) y tests e2e. */
export function configureApp(
  app: INestApplication,
  options: SetupOptions = {},
): INestApplication {
  app.setGlobalPrefix('api/v1');
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({
    origin: corsOrigins(),
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  if (options.swagger !== false) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('ContaBeni API')
      .setDescription(
        'API del ERP contable ContaBeni (Bolivia): ventas, compras, productos, cajas y bancos, contabilidad.',
      )
      .setVersion('1.0')
      .addBearerAuth()
      .addCookieAuth('refresh_token')
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('docs', app, document, {
      swaggerOptions: { persistAuthorization: true },
    });
  }

  return app;
}
