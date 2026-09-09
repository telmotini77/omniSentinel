import { Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { ReportFormat } from '@prisma/client';
import type {
  GeneratedReportFile,
  ReportDocument,
  ReportGenerationStrategy,
} from '../report-document';

@Injectable()
export class XlsxReportStrategy implements ReportGenerationStrategy {
  readonly format = ReportFormat.XLSX;

  async generate(document: ReportDocument): Promise<GeneratedReportFile> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'api_incidentReport';
    workbook.created = document.generatedAt;
    this.addSummary(workbook, document);
    this.addIncidents(workbook, document);
    this.addCustomers(workbook, document);
    this.addTimeline(workbook, document);
    this.addEvents(workbook, document);
    return {
      extension: 'xlsx',
      contentType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      content: Buffer.from(await workbook.xlsx.writeBuffer()),
    };
  }

  private addSummary(
    workbook: ExcelJS.Workbook,
    document: ReportDocument,
  ): void {
    const sheet = workbook.addWorksheet('Resumen');
    sheet.addRows([
      ['Reporte', document.title],
      ['Generado', document.generatedAt],
      ['Incidentes', document.summary.totalIncidents],
      ['Incidentes activos', document.summary.activeIncidents],
      ['Clientes afectados', document.summary.affectedCustomers],
      ['ONU offline', document.summary.offlineOnus],
      ['Confianza promedio', document.summary.averageRootCauseConfidence / 100],
    ]);
    sheet.getColumn(1).width = 24;
    sheet.getColumn(2).width = 42;
    sheet.getCell('A1').font = { bold: true };
    sheet.getCell('B7').numFmt = '0.00%';
  }

  private addIncidents(
    workbook: ExcelJS.Workbook,
    document: ReportDocument,
  ): void {
    const sheet = workbook.addWorksheet('Incidentes');
    sheet.columns = [
      { header: 'Código', key: 'code', width: 18 },
      { header: 'Tipo', key: 'type', width: 14 },
      { header: 'Severidad', key: 'severity', width: 14 },
      { header: 'Estado', key: 'status', width: 16 },
      { header: 'Causa raíz', key: 'rootCause', width: 24 },
      { header: 'Confianza', key: 'confidence', width: 14 },
      { header: 'OLT', key: 'olt', width: 20 },
      { header: 'PON', key: 'pon', width: 12 },
      { header: 'Afectados', key: 'affected', width: 14 },
      { header: 'Detección', key: 'detectedAt', width: 24 },
    ];
    document.incidents.forEach((incident) =>
      sheet.addRow({
        code: incident.code,
        type: incident.type,
        severity: incident.severity,
        status: incident.status,
        rootCause: incident.rootCause,
        confidence: incident.rootCauseConfidence / 100,
        olt: incident.oltExternalId,
        pon: incident.ponIdentifier,
        affected: incident.confirmedCustomerCount,
        detectedAt: incident.detectedAt,
      }),
    );
    sheet.getColumn('confidence').numFmt = '0.00%';
    this.styleTable(sheet);
  }

  private addCustomers(
    workbook: ExcelJS.Workbook,
    document: ReportDocument,
  ): void {
    const sheet = workbook.addWorksheet('Clientes afectados');
    sheet.columns = [
      { header: 'Código', key: 'code', width: 16 },
      { header: 'Nombre', key: 'name', width: 28 },
      { header: 'ONU', key: 'onu', width: 20 },
      { header: 'Plan', key: 'plan', width: 20 },
      { header: 'Estado actual', key: 'status', width: 16 },
      { header: 'Afectado', key: 'affected', width: 12 },
      { header: 'Inicio', key: 'affectedFrom', width: 24 },
      { header: 'Recuperación', key: 'restoredAt', width: 24 },
      { header: 'Duración (s)', key: 'duration', width: 16 },
    ];
    document.customers.forEach((customer) =>
      sheet.addRow({
        code: customer.customerCode,
        name: customer.customerName,
        onu: customer.onuSerial,
        plan: customer.servicePlan,
        status: customer.currentStatus,
        affected: customer.confirmedAffected,
        affectedFrom: customer.affectedFrom,
        restoredAt: customer.restoredAt,
        duration: customer.impactDurationSeconds,
      }),
    );
    this.styleTable(sheet);
  }

  private addTimeline(
    workbook: ExcelJS.Workbook,
    document: ReportDocument,
  ): void {
    const sheet = workbook.addWorksheet('Timeline');
    sheet.columns = [
      { header: 'Fecha', key: 'createdAt', width: 24 },
      { header: 'Evento', key: 'eventType', width: 28 },
      { header: 'Título', key: 'title', width: 36 },
      { header: 'Descripción', key: 'description', width: 60 },
      { header: 'Actor', key: 'performedBy', width: 18 },
    ];
    document.timeline.forEach((entry) => sheet.addRow(entry));
    this.styleTable(sheet);
  }

  private addEvents(
    workbook: ExcelJS.Workbook,
    document: ReportDocument,
  ): void {
    const sheet = workbook.addWorksheet('Eventos');
    sheet.columns = [
      { header: 'Fecha', key: 'occurredAt', width: 24 },
      { header: 'Tipo', key: 'eventType', width: 28 },
      { header: 'Evento externo', key: 'externalEventId', width: 24 },
      { header: 'Severidad', key: 'severity', width: 16 },
    ];
    document.events.forEach((event) =>
      sheet.addRow({
        occurredAt: event.occurredAt,
        eventType: event.eventType,
        externalEventId: event.alert.externalEventId,
        severity: event.alert.severity,
      }),
    );
    this.styleTable(sheet);
  }

  private styleTable(sheet: ExcelJS.Worksheet): void {
    const header = sheet.getRow(1);
    header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    header.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF0F766E' },
    };
    sheet.autoFilter = {
      from: 'A1',
      to: `${sheet.columnCount ? sheet.getColumn(sheet.columnCount).letter : 'A'}1`,
    };
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
  }
}
