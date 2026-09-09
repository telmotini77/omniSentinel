import type { ConfigService } from '@nestjs/config';
import {
  AlertSeverity,
  AlertSource,
  IncidentStatus,
  IncidentType,
  NotificationChannel,
  NotificationEvent,
  NotificationStatus,
  RootCause,
} from '@prisma/client';
import type { Incident, NotificationRule } from '@prisma/client';
import type { PrismaService } from '../database/prisma.service';
import type { NotificationDeliveryStrategy } from './notification-message';
import { NotificationsService } from './notifications.service';

function makeIncident(): Incident {
  const now = new Date('2026-09-09T14:32:00.000Z');
  return {
    id: '25d3dc16-218a-4134-835e-85a2e0c9dbda',
    code: 'INC-2026-000999',
    title: 'PON incident',
    description: null,
    type: IncidentType.PON,
    severity: AlertSeverity.CRITICAL,
    status: IncidentStatus.DETECTED,
    source: AlertSource.ZABBIX,
    rootCause: RootCause.PON_FAILURE,
    rootCauseConfidence: 91,
    oltExternalId: 'OLT-CUE-01',
    ponIdentifier: '1/4',
    onuSerial: null,
    correlationKey: 'pon:OLT-CUE-01:1/4',
    affectedCustomerCount: 29,
    potentialCustomerCount: 32,
    confirmedCustomerCount: 29,
    onlineCustomerCount: 3,
    offlineOnuCount: 29,
    onlineOnuCount: 3,
    detectedAt: now,
    startedAt: now,
    acknowledgedAt: null,
    resolvedAt: null,
    closedAt: null,
    durationSeconds: 0,
    assignedUserId: null,
    createdAt: now,
    updatedAt: now,
  };
}

function makeRule(destination: string | null): NotificationRule {
  const now = new Date('2026-09-09T14:32:00.000Z');
  return {
    id: '00000000-0000-4000-8000-000000000701',
    name: 'critical-webhook',
    description: null,
    enabled: true,
    event: NotificationEvent.INCIDENT_CREATED,
    channel: NotificationChannel.WEBHOOK,
    minimumSeverity: AlertSeverity.CRITICAL,
    destination,
    createdAt: now,
    updatedAt: now,
  };
}

describe('NotificationsService', () => {
  it('persists a sent delivery when an eligible strategy succeeds', async () => {
    let lastUpdate: { data: { status: NotificationStatus } } | undefined;
    const update = jest.fn(
      (input: { data: { status: NotificationStatus } }) => {
        lastUpdate = input;
        return Promise.resolve(undefined);
      },
    );
    const prisma = {
      notificationRule: {
        findMany: jest
          .fn()
          .mockResolvedValue([makeRule('https://example.test/hooks')]),
      },
      notification: {
        create: jest.fn().mockResolvedValue({ id: 'notification-001' }),
        update,
      },
    };
    const deliver = jest
      .fn()
      .mockResolvedValue({ metadata: { statusCode: 204 } });
    const delivery: NotificationDeliveryStrategy = {
      channel: NotificationChannel.WEBHOOK,
      deliver,
    };
    const service = new NotificationsService(
      prisma as unknown as PrismaService,
      { getOrThrow: jest.fn().mockReturnValue('') } as unknown as ConfigService,
      [delivery],
    );

    await service.dispatch(NotificationEvent.INCIDENT_CREATED, makeIncident());

    expect(deliver).toHaveBeenCalledTimes(1);
    expect(lastUpdate?.data.status).toBe(NotificationStatus.SENT);
  });

  it('records a skipped delivery when a rule has no destination', async () => {
    let createInput: { data: { status: NotificationStatus } } | undefined;
    const create = jest.fn(
      (input: { data: { status: NotificationStatus } }) => {
        createInput = input;
        return Promise.resolve(undefined);
      },
    );
    const prisma = {
      notificationRule: {
        findMany: jest.fn().mockResolvedValue([makeRule(null)]),
      },
      notification: { create },
    };
    const service = new NotificationsService(
      prisma as unknown as PrismaService,
      { getOrThrow: jest.fn().mockReturnValue('') } as unknown as ConfigService,
      [],
    );

    await service.dispatch(NotificationEvent.INCIDENT_CREATED, makeIncident());

    expect(createInput?.data.status).toBe(NotificationStatus.SKIPPED);
  });
});
