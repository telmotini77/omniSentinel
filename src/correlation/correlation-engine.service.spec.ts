import type { ConfigService } from '@nestjs/config';
import {
  AlertSeverity,
  AlertSource,
  AlertStatus,
  IncidentType,
  RootCause,
} from '@prisma/client';
import type { Alert, CorrelationRule, Prisma } from '@prisma/client';
import { CorrelationEngineService } from './correlation-engine.service';

function makeAlert(): Alert {
  const now = new Date('2026-09-09T14:32:00.000Z');
  return {
    id: '15d3dc16-218a-4134-835e-85a2e0c9dbda',
    externalEventId: 'evt-correlation-unit-001',
    eventType: 'onu.offline',
    severity: AlertSeverity.MINOR,
    source: AlertSource.ZABBIX,
    status: AlertStatus.NEW,
    message: null,
    oltExternalId: 'OLT-CUE-01',
    ponIdentifier: '1/4',
    onuSerial: 'ONU-001',
    customerCode: null,
    payload: { metrics: { onuOffline: 10 } },
    detectedAt: now,
    resolvedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

function makeRule(): CorrelationRule {
  const now = new Date('2026-09-09T14:32:00.000Z');
  return {
    id: '00000000-0000-4000-8000-000000000601',
    name: 'multiple-onu-on-a-pon',
    description: null,
    enabled: true,
    priority: 10,
    eventPattern: 'onu.offline',
    minimumEventCount: null,
    minimumDistinctOnus: 10,
    minimumAffectedCustomers: null,
    incidentType: IncidentType.PON,
    rootCause: RootCause.PON_FAILURE,
    rootCauseConfidence: 85,
    severity: AlertSeverity.CRITICAL,
    createdAt: now,
    updatedAt: now,
  };
}

describe('CorrelationEngineService', () => {
  it('correlates ten distinct ONU offline events on a PON using a persisted rule', async () => {
    const alert = makeAlert();
    const candidates = Array.from({ length: 10 }, (_, index) => ({
      eventType: 'onu.offline',
      onuSerial: `ONU-${(index + 1).toString().padStart(3, '0')}`,
      payload: { metrics: { onuOffline: 10 } },
    }));
    const transaction = {
      alert: { findMany: jest.fn().mockResolvedValue(candidates) },
      correlationRule: { findMany: jest.fn().mockResolvedValue([makeRule()]) },
    } as unknown as Prisma.TransactionClient;
    const config = {
      getOrThrow: jest.fn().mockReturnValue(60),
    } as unknown as ConfigService;
    const service = new CorrelationEngineService(config);

    const decision = await service.analyze(transaction, alert);

    expect(decision).toMatchObject({
      correlationKey: 'pon:OLT-CUE-01:1/4',
      eventCount: 10,
      distinctOnuCount: 10,
      affectedCustomerCount: 10,
      incidentType: IncidentType.PON,
      rootCause: RootCause.PON_FAILURE,
      rootCauseConfidence: 85,
      severity: AlertSeverity.CRITICAL,
    });
  });
});
