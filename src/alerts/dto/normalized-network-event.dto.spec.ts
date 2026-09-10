import { AlertSeverity, AlertSource } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { NormalizedNetworkEventDto } from './normalized-network-event.dto';

const event = {
  eventId: 'zasmaolt:unit:001',
  eventType: 'onu.offline',
  severity: AlertSeverity.MAJOR,
  source: AlertSource.API_ZASMAOLT,
  timestamp: '2026-09-09T12:00:00.000Z',
  device: { oltId: 'OLT-01', board: 1, pon: 4 },
};

describe('NormalizedNetworkEventDto', () => {
  it('accepts events normalized by api_zaSmaOlt', async () => {
    const errors = await validate(
      plainToInstance(NormalizedNetworkEventDto, event),
    );

    expect(errors).toHaveLength(0);
  });

  it.each([AlertSource.ZABBIX, AlertSource.SMARTOLT])(
    'rejects direct %s events',
    async (source) => {
      const errors = await validate(
        plainToInstance(NormalizedNetworkEventDto, { ...event, source }),
      );

      expect(errors.some((error) => error.property === 'source')).toBe(true);
    },
  );
});
