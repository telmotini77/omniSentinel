import type { Incident } from '@prisma/client';
import type { PrismaService } from '../database/prisma.service';
import { SlaService } from './sla.service';

function incident(start: string, resolvedAt: string): Incident {
  return {
    startedAt: new Date(start),
    detectedAt: new Date(start),
    resolvedAt: new Date(resolvedAt),
  } as unknown as Incident;
}

describe('SlaService', () => {
  it('merges overlapping outages before calculating availability and MTBF', async () => {
    const findMany = jest
      .fn()
      .mockResolvedValue([
        incident('2026-09-01T00:00:00.000Z', '2026-09-01T01:00:00.000Z'),
        incident('2026-09-01T12:00:00.000Z', '2026-09-01T13:00:00.000Z'),
        incident('2026-09-01T12:30:00.000Z', '2026-09-01T14:00:00.000Z'),
      ]);
    const service = new SlaService({
      incident: { findMany },
    } as unknown as PrismaService);

    const result = await service.calculate({
      startDate: '2026-09-01T00:00:00.000Z',
      endDate: '2026-09-02T00:00:00.000Z',
    });

    expect(result).toMatchObject({
      totalMinutes: 1440,
      downtimeMinutes: 180,
      availabilityPercentage: 87.5,
      incidentCount: 3,
      mttrMinutes: 70,
      mtbfMinutes: 420,
    });
  });

  it('rejects periods without a positive duration', () => {
    const service = new SlaService({} as PrismaService);

    expect(() =>
      service.resolvePeriod({
        startDate: '2026-09-02T00:00:00.000Z',
        endDate: '2026-09-01T00:00:00.000Z',
      }),
    ).toThrow('startDate must be earlier than endDate');
  });
});
