import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { AuthModule } from './auth/auth.module';
import { AlertsModule } from './alerts/alerts.module';
import { IncidentsModule } from './incidents/incidents.module';
import { InventoryModule } from './inventory/inventory.module';
import { ImpactModule } from './impact/impact.module';
import { ZasmaoltModule } from './integrations/zasmaolt/zasmaolt.module';
import { CorrelationModule } from './correlation/correlation.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { environmentValidationSchema } from './config/env.validation';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { RabbitMqModule } from './rabbitmq/rabbitmq.module';
import { ReportsModule } from './reports/reports.module';
import { SlaModule } from './sla/sla.module';
import { StatisticsModule } from './statistics/statistics.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ObservabilityModule } from './observability/observability.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: environmentValidationSchema,
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => [
        {
          ttl:
            configService.getOrThrow<number>('RATE_LIMIT_TTL_SECONDS') * 1_000,
          limit: configService.getOrThrow<number>('RATE_LIMIT_LIMIT'),
        },
      ],
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        name: 'api_incidentReport',
        transport:
          process.env.NODE_ENV === 'production'
            ? undefined
            : { target: 'pino-pretty', options: { singleLine: true } },
        redact: ['req.headers.authorization', 'req.headers.cookie'],
      },
    }),
    DatabaseModule,
    ObservabilityModule,
    RabbitMqModule,
    HealthModule,
    ZasmaoltModule,
    CorrelationModule,
    AlertsModule,
    IncidentsModule,
    InventoryModule,
    ImpactModule,
    ReportsModule,
    NotificationsModule,
    SlaModule,
    StatisticsModule,
    DashboardModule,
    UsersModule,
    AuthModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
