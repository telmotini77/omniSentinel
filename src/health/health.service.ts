import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../cache/redis.service';
import { PrismaService } from '../database/prisma.service';
import { RabbitMqService } from '../rabbitmq/rabbitmq.service';
import { access } from 'node:fs/promises';

type DependencyStatus = 'up' | 'down';
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
  ) {}

  async check(): Promise<HealthResult> {
    const checks = await Promise.all([
      this.checkDependency(() => this.prisma.$queryRaw`SELECT 1`),
      this.checkDependency(() => this.redis.ping()),
      this.checkDependency(() => this.rabbitMq.assertInfrastructure()),
      this.checkZasmaolt(),
      this.checkDependency(() =>
        access(this.configService.getOrThrow<string>('REPORT_STORAGE_PATH')),
      ),
    ]);
    const [database, redis, rabbitmq, apiZasmaolt, storage] = checks;
    const services = { database, redis, rabbitmq, apiZasmaolt, storage };
    return {
      status: Object.values(services).every((service) => service === 'up')
        ? 'healthy'
        : 'degraded',
      services,
    };
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

  private async checkZasmaolt(): Promise<DependencyStatus> {
    return this.checkDependency(async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2_000);
      try {
        const response = await fetch(
          this.configService.getOrThrow<string>('ZASMAOLT_API_URL'),
          {
            method: 'HEAD',
            signal: controller.signal,
          },
        );
        if (response.status >= 500) throw new Error('Upstream service error');
      } finally {
        clearTimeout(timeout);
      }
    });
  }
}
