import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../cache/redis.service';
import { PrismaService } from '../database/prisma.service';
import { RabbitMqService } from '../rabbitmq/rabbitmq.service';
import { HealthService } from './health.service';
import { ZASMAOLT_ADAPTER } from '../integrations/zasmaolt/zasmaolt.adapter';

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
        {
          provide: ZASMAOLT_ADAPTER,
          useValue: { checkHealth: jest.fn().mockResolvedValue(undefined) },
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

  it('reports RabbitMQ as disabled without probing it when disabled by config', async () => {
    const rabbitMq = {
      assertInfrastructure: jest.fn().mockResolvedValue(undefined),
    };
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
        { provide: RabbitMqService, useValue: rabbitMq },
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: jest.fn((key: string) =>
              key === 'RABBITMQ_ENABLED' ? false : '.',
            ),
          },
        },
        {
          provide: ZASMAOLT_ADAPTER,
          useValue: { checkHealth: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile();
    const service = module.get(HealthService);

    await expect(service.check()).resolves.toMatchObject({
      status: 'healthy',
      services: { rabbitmq: 'disabled' },
    });
    expect(rabbitMq.assertInfrastructure).not.toHaveBeenCalled();
  });
});
