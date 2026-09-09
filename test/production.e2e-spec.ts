import { Module, RequestMethod, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Server } from 'node:http';
import * as request from 'supertest';
import { CacheModule } from '../src/cache/cache.module';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../src/common/guards/permissions.guard';
import { environmentValidationSchema } from '../src/config/env.validation';
import { DatabaseModule } from '../src/database/database.module';
import { HealthModule } from '../src/health/health.module';
import { ZasmaoltModule } from '../src/integrations/zasmaolt/zasmaolt.module';
import { ObservabilityModule } from '../src/observability/observability.module';
import { RabbitMqModule } from '../src/rabbitmq/rabbitmq.module';
import { SlaModule } from '../src/sla/sla.module';
import { StatisticsModule } from '../src/statistics/statistics.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: environmentValidationSchema,
    }),
    JwtModule.register({}),
    DatabaseModule,
    CacheModule,
    RabbitMqModule,
    ZasmaoltModule,
    ObservabilityModule,
    HealthModule,
    SlaModule,
    StatisticsModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
class ProductionE2eModule {}

describe('Production safeguards (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ProductionE2eModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1', {
      exclude: [{ path: 'metrics', method: RequestMethod.GET }],
    });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('exposes health and development metrics but protects statistics', async () => {
    const server = app.getHttpServer() as Server;
    await request(server).get('/api/v1/health').expect(200);
    const metrics = await request(server)
      .get('/metrics')
      .expect(200)
      .expect('Content-Type', /text\/plain/);
    expect(metrics.text).toContain('alerts_received_total');
    await request(server).get('/api/v1/statistics').expect(401);
  });
});
