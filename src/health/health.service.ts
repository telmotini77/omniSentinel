import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../cache/redis.service';
import { PrismaService } from '../database/prisma.service';
import { RabbitMqService } from '../rabbitmq/rabbitmq.service';
import { access } from 'node:fs/promises';
import {
  ZASMAOLT_ADAPTER,
  type ZasmaoltAdapter,
} from '../integrations/zasmaolt/zasmaolt.adapter';

type DependencyStatus = 'up' | 'down' | 'disabled';
type HealthResult = {
  status: 'healthy' | 'degraded';
  services: {
    database: DependencyStatus;
    redis: DependencyStatus;
    rabbitmq: DependencyStatus;
    apiZasmaolt: DependencyStatus;
    storage: DependencyStatus;
  };
};

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly rabbitMq: RabbitMqService,
    private readonly configService: ConfigService,
    @Inject(ZASMAOLT_ADAPTER) private readonly zasmaolt: ZasmaoltAdapter,
  ) {}

  async check(): Promise<HealthResult> {
    const checks = await Promise.all([
      this.checkDependency(() => this.prisma.$queryRaw`SELECT 1`),
      this.checkDependency(() => this.redis.ping()),
      this.rabbitMqStatus(),
      this.checkDependency(() => this.zasmaolt.checkHealth()),
      this.checkDependency(() =>
        access(this.configService.getOrThrow<string>('REPORT_STORAGE_PATH')),
      ),
    ]);
    const [database, redis, rabbitmq, apiZasmaolt, storage] = checks;
    const services = { database, redis, rabbitmq, apiZasmaolt, storage };
    return {
      status: Object.values(services).every((service) => service !== 'down')
        ? 'healthy'
        : 'degraded',
      services,
    };
  }

  private async rabbitMqStatus(): Promise<DependencyStatus> {
    if (!this.rabbitMqIsEnabled()) {
      return 'disabled';
    }
    return this.checkDependency(() => this.rabbitMq.assertInfrastructure());
  }

  private rabbitMqIsEnabled(): boolean {
    const value = this.configService.getOrThrow<unknown>('RABBITMQ_ENABLED');
    return value === true || value === 'true';
  }

  private async checkDependency(
    action: () => Promise<unknown>,
  ): Promise<DependencyStatus> {
    try {
      await action();
      return 'up';
    } catch {
      return 'down';
    }
  }
}
