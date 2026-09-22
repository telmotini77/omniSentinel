import {
  AlertSeverity,
  AlertSource,
  AlertStatus,
  Prisma,
} from '@prisma/client';
import type { Alert } from '@prisma/client';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../database/prisma.service';
import type { NormalizedNetworkEventDto } from './dto/normalized-network-event.dto';
import { AlertsService } from './alerts.service';

const event: NormalizedNetworkEventDto = {
  eventId: 'evt-unit-001',
  eventType: 'pon.los',
  severity: AlertSeverity.CRITICAL,
  source: AlertSource.API_ZASMAOLT,
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
        create: jest.fn().mockResolvedValue(alert),
      },
    };
    const module = await Test.createTestingModule({
      providers: [AlertsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    const result = await module.get(AlertsService).ingest(event);

    expect(result).toEqual({ result: 'created', alert });
    expect(prisma.alert.create).toHaveBeenCalledTimes(1);
  });

  it('returns the existing alert when the database rejects a duplicate', async () => {
    const alert = makeAlert();
    const prisma = {
      alert: {
        create: jest.fn().mockRejectedValue(
          new Prisma.PrismaClientKnownRequestError('Duplicate', {
            code: 'P2002',
            clientVersion: 'test',
          }),
        ),
        findUniqueOrThrow: jest.fn().mockResolvedValue(alert),
      },
    };
    const module = await Test.createTestingModule({
      providers: [AlertsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    await expect(module.get(AlertsService).ingest(event)).resolves.toEqual({
      result: 'duplicate',
      alert,
    });
  });
});
