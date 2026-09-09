import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../cache/redis.service';
import { PrismaService } from '../database/prisma.service';
import { RabbitMqService } from '../rabbitmq/rabbitmq.service';
import { HealthService } from './health.service';

describe('HealthService', () => {
  it('reports healthy when every dependency is available', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response(null, { status: 204 }));
    const module = await Test.createTestingModule({
      providers: [
        HealthService,
        {
          provide: PrismaService,
          useValue: {
            $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
          },
        },
        {
          provide: RedisService,
          useValue: { ping: jest.fn().mockResolvedValue(undefined) },
        },
        {
          provide: RabbitMqService,
          useValue: {
            assertInfrastructure: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: ConfigService,
          useValue: { getOrThrow: jest.fn().mockReturnValue('.') },
        },
      ],
    }).compile();
    const service = module.get(HealthService);

    await expect(service.check()).resolves.toEqual({
      status: 'healthy',
      services: {
        database: 'up',
        redis: 'up',
        rabbitmq: 'up',
        apiZasmaolt: 'up',
        storage: 'up',
      },
    });
    jest.restoreAllMocks();
  });
});
