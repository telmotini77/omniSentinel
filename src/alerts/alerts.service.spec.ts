import { AlertSeverity, AlertSource, AlertStatus } from '@prisma/client';
import type { Alert } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { RedisService } from '../cache/redis.service';
import { PrismaService } from '../database/prisma.service';
import type { NormalizedNetworkEventDto } from './dto/normalized-network-event.dto';
import { AlertsService } from './alerts.service';

const event: NormalizedNetworkEventDto = {
  eventId: 'evt-unit-001',
  eventType: 'pon.down',
  severity: AlertSeverity.CRITICAL,
  source: AlertSource.ZABBIX,
  timestamp: '2026-09-09T09:32:00-05:00',
  device: { oltId: 'OLT-CUE-01', board: 1, pon: 4 },
};

function makeAlert(): Alert {
  const now = new Date('2026-09-09T14:32:00.000Z');
  return {
    id: '5d3dc162-b18a-4134-835e-85a2e0c9dbda',
    externalEventId: event.eventId,
    eventType: event.eventType,
    severity: event.severity,
    source: event.source,
    status: AlertStatus.NEW,
    message: null,
    oltExternalId: 'OLT-CUE-01',
    ponIdentifier: '1/4',
    onuSerial: null,
    customerCode: null,
    payload: {},
    detectedAt: now,
    resolvedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

describe('AlertsService', () => {
  it('persists a newly claimed normalized event', async () => {
    const alert = makeAlert();
    const prisma = {
      alert: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(alert),
      },
    };
    const redis = {
      setIfAbsent: jest.fn().mockResolvedValue(true),
      set: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    const module = await Test.createTestingModule({
      providers: [
        AlertsService,
        { provide: PrismaService, useValue: prisma },
        { provide: RedisService, useValue: redis },
        {
          provide: ConfigService,
          useValue: { getOrThrow: jest.fn().mockReturnValue(86_400) },
        },
      ],
    }).compile();

    const result = await module.get(AlertsService).ingest(event);

    expect(result).toEqual({ result: 'created', alert });
    expect(prisma.alert.create).toHaveBeenCalledTimes(1);
    expect(redis.set).toHaveBeenCalledWith(
      `alerts:external-event:${event.eventId}`,
      alert.id,
      86_400,
    );
  });

  it('returns the existing alert when an event was already claimed', async () => {
    const alert = makeAlert();
    const prisma = {
      alert: { findUnique: jest.fn().mockResolvedValue(alert) },
    };
    const redis = { setIfAbsent: jest.fn().mockResolvedValue(false) };
    const module = await Test.createTestingModule({
      providers: [
        AlertsService,
        { provide: PrismaService, useValue: prisma },
        { provide: RedisService, useValue: redis },
        {
          provide: ConfigService,
          useValue: { getOrThrow: jest.fn().mockReturnValue(86_400) },
        },
      ],
    }).compile();

    await expect(module.get(AlertsService).ingest(event)).resolves.toEqual({
      result: 'duplicate',
      alert,
    });
  });
});
