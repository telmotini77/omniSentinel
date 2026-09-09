import type {
  Incident,
  IncidentCustomer,
  IncidentEvent,
  IncidentTimeline,
  ReportFormat,
  ReportType,
} from '@prisma/client';

export interface ReportDocument {
  title: string;
  type: ReportType;
  format: ReportFormat;
  generatedAt: Date;
  periodStart?: Date;
  periodEnd?: Date;
  incident?: Incident;
  incidents: Incident[];
  customers: IncidentCustomer[];
  events: Array<
    IncidentEvent & { alert: { externalEventId: string; severity: string } }
  >;
  timeline: IncidentTimeline[];
  summary: {
    totalIncidents: number;
    activeIncidents: number;
    affectedCustomers: number;
    offlineOnus: number;
    averageRootCauseConfidence: number;
  };
}

export interface GeneratedReportFile {
  extension: string;
  contentType: string;
  content: Buffer;
}

export interface ReportGenerationStrategy {
  readonly format: ReportFormat;
  generate(document: ReportDocument): Promise<GeneratedReportFile>;
}

export const REPORT_STRATEGIES = Symbol('REPORT_STRATEGIES');
