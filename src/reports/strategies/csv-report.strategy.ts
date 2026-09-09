import { Injectable } from '@nestjs/common';
import { format } from '@fast-csv/format';
import { ReportFormat } from '@prisma/client';
import type {
  GeneratedReportFile,
  ReportDocument,
  ReportGenerationStrategy,
} from '../report-document';

@Injectable()
export class CsvReportStrategy implements ReportGenerationStrategy {
  readonly format = ReportFormat.CSV;

  async generate(document: ReportDocument): Promise<GeneratedReportFile> {
    const rows: Record<string, string | number | boolean>[] = document.customers
      .length
      ? document.customers.map((customer) => ({
          incidentCode:
            document.incidents.find(
              (incident) => incident.id === customer.incidentId,
            )?.code ?? '',
          customerCode: customer.customerCode ?? '',
          customerName: customer.customerName ?? '',
          onuSerial: customer.onuSerial ?? '',
          servicePlan: customer.servicePlan ?? '',
          currentStatus: customer.currentStatus,
          confirmedAffected: customer.confirmedAffected,
          affectedFrom: customer.affectedFrom?.toISOString() ?? '',
          restoredAt: customer.restoredAt?.toISOString() ?? '',
          impactDurationSeconds: customer.impactDurationSeconds,
        }))
      : document.incidents.length
        ? document.incidents.map((incident) => ({
            code: incident.code,
            type: incident.type,
            severity: incident.severity,
            status: incident.status,
            rootCause: incident.rootCause,
            rootCauseConfidence: incident.rootCauseConfidence,
            oltExternalId: incident.oltExternalId ?? '',
            ponIdentifier: incident.ponIdentifier ?? '',
            affectedCustomers: incident.confirmedCustomerCount,
            detectedAt: incident.detectedAt.toISOString(),
          }))
        : [
            {
              reportTitle: document.title,
              totalIncidents: document.summary.totalIncidents,
              activeIncidents: document.summary.activeIncidents,
              affectedCustomers: document.summary.affectedCustomers,
              offlineOnus: document.summary.offlineOnus,
            },
          ];
    const content = await this.serialize(rows);
    return {
      extension: 'csv',
      contentType: 'text/csv; charset=utf-8',
      content,
    };
  }

  private serialize(
    rows: Record<string, string | number | boolean>[],
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      const stream = format({ headers: true });
      stream.on('data', (chunk: Buffer | string) =>
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)),
      );
      stream.on('error', reject);
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      for (const row of rows) stream.write(row);
      stream.end();
    });
  }
}
