import type { ConfigService } from '@nestjs/config';
import { MetricsService } from './metrics.service';

describe('MetricsService', () => {
  it('exports the required custom Prometheus metrics', async () => {
    const config = {
      get: jest.fn((key: string) => {
        const values: Record<string, boolean | string> = {
          METRICS_ENABLED: true,
          NODE_ENV: 'test',
        };
        return values[key];
      }),
    };
    const metrics = new MetricsService(config as unknown as ConfigService);
    metrics.recordAlert('ZABBIX', 'pon.down', 'created');
    metrics.recordIncidentCreated('PON', 'CRITICAL');
    metrics.recordIncidentResolved('CRITICAL');
    metrics.recordAffectedCustomers(29);
    metrics.recordReportGenerated('INCIDENT_REPORT', 'PDF', 'completed');
    metrics.recordFailedEvent('alert_consumer');
    metrics.recordEventProcessingDuration(0.15, 'success');
    metrics.recordReportGenerationDuration(1.25, 'PDF', 'completed');
    metrics.recordZasmaoltRequestDuration(0.05, 'GET', 'success');

    const exposition = await metrics.exposition();

    expect(exposition.contentType).toContain('text/plain');
    expect(exposition.body).toContain('alerts_received_total');
    expect(exposition.body).toContain('incidents_created_total');
    expect(exposition.body).toContain('incidents_resolved_total');
    expect(exposition.body).toContain('reports_generated_total');
    expect(exposition.body).toContain('affected_customers_total');
    expect(exposition.body).toContain('failed_events_total');
    expect(exposition.body).toContain('event_processing_duration_seconds');
    expect(exposition.body).toContain('report_generation_duration_seconds');
    expect(exposition.body).toContain('zasmaolt_request_duration_seconds');
  });
});
