import { RequestMethod, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });
  const logger = app.get(Logger);
  const config = app.get(ConfigService);
  app.useLogger(logger);
  // Propagate Docker/system shutdown signals through Nest. This invokes
  // OnModuleDestroy on the api_zaSmaOlt event puller, clears its timer, and
  // avoids overlapping pollers while the microservice is restarted.
  app.enableShutdownHooks();
  // OmniSentinel is intentionally exposed over plain HTTP on the private
  // network. Do not advertise HSTS or CSP upgrade-insecure-requests here:
  // either header makes browsers rewrite http://IP:3000 navigation to HTTPS,
  // while TLS is terminated only when a dedicated HTTPS proxy is configured.
  app.use(
    helmet({
      hsts: false,
      contentSecurityPolicy: {
        directives: { upgradeInsecureRequests: null },
      },
    }),
  );
  const corsOrigins = config
    .getOrThrow<string>('CORS_ORIGINS')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (error: Error | null, allowed?: boolean) => void,
    ) => {
      if (!origin || corsOrigins.includes(origin)) return callback(null, true);
      return callback(new Error('Origin is not allowed by CORS policy'));
    },
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE'],
    allowedHeaders: ['Authorization', 'Content-Type', 'x-integration-api-key'],
    maxAge: 600,
  });
  const httpServer = app.getHttpAdapter().getInstance() as {
    set(setting: string, value: boolean): void;
    get(path: string, handler: (request: Request, response: Response) => void): void;
  };
  httpServer.set('trust proxy', config.getOrThrow<boolean>('TRUST_PROXY'));
  const sourcePublicDir = join(process.cwd(), 'public');
  const compiledPublicDir = join(process.cwd(), 'dist', 'public');
  const publicDir = existsSync(compiledPublicDir)
    ? compiledPublicDir
    : sourcePublicDir;
  const landingPage = join(publicDir, 'index.html');
  const dashboardPage = join(publicDir, 'dashboard', 'index.html');
  const serveLanding = (_request: Request, response: Response): void => {
    response.sendFile(landingPage);
  };
  const serveLogin = (_request: Request, response: Response): void => {
    response.sendFile(dashboardPage);
  };
  const redirectDashboard = (_request: Request, response: Response): void => {
    response.redirect(302, '/');
  };
  httpServer.get('/', serveLanding);
  httpServer.get('/index.html', (_request, response) => response.redirect(301, '/'));
  httpServer.get('/login', serveLogin);
  httpServer.get('/login/', serveLogin);
  httpServer.get('/dashboard', redirectDashboard);
  httpServer.get('/dashboard/', redirectDashboard);
  app.useStaticAssets(publicDir, { prefix: '/' });
  app.setGlobalPrefix(config.getOrThrow<string>('API_PREFIX'), {
    exclude: [{ path: 'metrics', method: RequestMethod.GET }],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalFilters(new GlobalExceptionFilter(logger));

  const swaggerEnabled =
    config.get<boolean>('SWAGGER_ENABLED') ??
    config.getOrThrow<string>('NODE_ENV') !== 'production';
  if (swaggerEnabled) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('api_incidentReport')
      .setDescription(
        'Independent incident reporting service for ISP/FTTH operations',
      )
      .setVersion('0.1.0')
      .addBearerAuth(
        { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        'access-token',
      )
      .build();
    SwaggerModule.setup(
      'api/docs',
      app,
      SwaggerModule.createDocument(app, swaggerConfig),
    );
  }

  await app.listen(
    config.getOrThrow<number>('PORT'),
    config.getOrThrow<string>('HOST'),
  );
}

void bootstrap();
