import { ReportFormat, ReportType } from '@prisma/client';
import type { ReportDocument } from '../report-document';
import { CsvReportStrategy } from './csv-report.strategy';
import { JsonReportStrategy } from './json-report.strategy';

const document: ReportDocument = {
  title: 'Informe de prueba',
  type: ReportType.DAILY_REPORT,
  format: ReportFormat.JSON,
  generatedAt: new Date('2026-09-09T14:32:00.000Z'),
  incidents: [],
  customers: [],
  events: [],
  timeline: [],
  summary: {
    totalIncidents: 0,
    activeIncidents: 0,
    affectedCustomers: 0,
    offlineOnus: 0,
    averageRootCauseConfidence: 0,
  },
};

describe('report generation strategies', () => {
  it('serializes the canonical document as JSON', async () => {
    const result = await new JsonReportStrategy().generate(document);

    expect(result.extension).toBe('json');
    expect(JSON.parse(result.content.toString('utf8'))).toMatchObject({
      title: 'Informe de prueba',
      type: ReportType.DAILY_REPORT,
    });
  });

  it('exports a summary row as CSV when there is no detailed data', async () => {
    const result = await new CsvReportStrategy().generate(document);

    expect(result.extension).toBe('csv');
    expect(result.content.toString('utf8')).toContain('reportTitle');
  });
});
