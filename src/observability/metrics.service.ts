import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  collectDefaultMetrics,
  Counter,
  Histogram,
  Registry,
} from '@prometheus-io/client';

@Injectable()
export class MetricsService {
  private readonly registry = new Registry();
  private readonly enabled: boolean;

  private readonly alertsReceived = new Counter<
    'source' | 'event_type' | 'result'
  >({
    name: 'alerts_received_total',
    help: 'Total normalized alerts received by result, source and event type',
    labelNames: ['source', 'event_type', 'result'],
    registers: [this.registry],
  });
  private readonly incidentsCreated = new Counter<'type' | 'severity'>({
    name: 'incidents_created_total',
    help: 'Total incidents created by type and severity',
    labelNames: ['type', 'severity'],
    registers: [this.registry],
  });
  private readonly incidentsResolved = new Counter<'severity'>({
    name: 'incidents_resolved_total',
    help: 'Total incidents resolved by severity',
    labelNames: ['severity'],
    registers: [this.registry],
  });
  private readonly reportsGenerated = new Counter<'type' | 'format' | 'result'>(
    {
      name: 'reports_generated_total',
      help: 'Total report generation attempts by type, format and result',
      labelNames: ['type', 'format', 'result'],
      registers: [this.registry],
    },
  );
  private readonly affectedCustomers = new Counter({
    name: 'affected_customers_total',
    help: 'Total confirmed affected customers observed during impact refreshes',
    registers: [this.registry],
  });
  private readonly failedEvents = new Counter<'stage'>({
    name: 'failed_events_total',
    help: 'Total failed processing events by pipeline stage',
    labelNames: ['stage'],
    registers: [this.registry],
  });
  private readonly eventProcessingDuration = new Histogram<'outcome'>({
    name: 'event_processing_duration_seconds',
    help: 'Duration of normalized alert processing',
    labelNames: ['outcome'],
    buckets: [0.005, 0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10],
    registers: [this.registry],
  });
  private readonly reportGenerationDuration = new Histogram<
    'format' | 'outcome'
  >({
    name: 'report_generation_duration_seconds',
    help: 'Duration of report generation by format and outcome',
    labelNames: ['format', 'outcome'],
    buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60, 120],
    registers: [this.registry],
  });
  private readonly zasmaoltRequestDuration = new Histogram<
    'method' | 'outcome'
  >({
    name: 'zasmaolt_request_duration_seconds',
    help: 'Duration of api_zaSmaOlt adapter requests',
    labelNames: ['method', 'outcome'],
    buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10],
    registers: [this.registry],
  });

  constructor(private readonly configService: ConfigService) {
    this.enabled =
      this.configService.get<boolean>('METRICS_ENABLED') ??
      this.configService.get<string>('NODE_ENV') !== 'production';
    if (this.enabled)
      collectDefaultMetrics({
        register: this.registry,
        prefix: 'api_incident_report_',
      });
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  async exposition(): Promise<{ contentType: string; body: string }> {
    return {
      contentType: this.registry.contentType,
      body: await this.registry.metrics(),
    };
  }

  recordAlert(source: string, eventType: string, result: string): void {
    if (!this.enabled) return;
    this.alertsReceived.inc({ source, event_type: eventType, result });
  }

  recordIncidentCreated(type: string, severity: string): void {
    if (!this.enabled) return;
    this.incidentsCreated.inc({ type, severity });
  }

  recordIncidentResolved(severity: string): void {
    if (!this.enabled) return;
    this.incidentsResolved.inc({ severity });
  }

  recordAffectedCustomers(count: number): void {
    if (!this.enabled || count <= 0) return;
    this.affectedCustomers.inc(count);
  }

  recordReportGenerated(type: string, format: string, result: string): void {
    if (!this.enabled) return;
    this.reportsGenerated.inc({ type, format, result });
  }

  recordFailedEvent(stage: string): void {
    if (!this.enabled) return;
    this.failedEvents.inc({ stage });
  }

  recordEventProcessingDuration(seconds: number, outcome: string): void {
    if (!this.enabled) return;
    this.eventProcessingDuration.observe({ outcome }, Math.max(0, seconds));
  }

  recordReportGenerationDuration(
    seconds: number,
    format: string,
    outcome: string,
  ): void {
    if (!this.enabled) return;
    this.reportGenerationDuration.observe(
      { format, outcome },
      Math.max(0, seconds),
    );
  }

  recordZasmaoltRequestDuration(
    seconds: number,
    method: string,
    outcome: string,
  ): void {
    if (!this.enabled) return;
    this.zasmaoltRequestDuration.observe(
      { method, outcome },
      Math.max(0, seconds),
    );
  }
}
