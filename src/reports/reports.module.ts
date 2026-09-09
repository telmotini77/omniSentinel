import { Module } from '@nestjs/common';
import { IncidentReportsController } from './incident-reports.controller';
import {
  REPORT_STRATEGIES,
  type ReportGenerationStrategy,
} from './report-document';
import { ReportDataService } from './report-data.service';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { CsvReportStrategy } from './strategies/csv-report.strategy';
import { JsonReportStrategy } from './strategies/json-report.strategy';
import { PdfReportStrategy } from './strategies/pdf-report.strategy';
import { XlsxReportStrategy } from './strategies/xlsx-report.strategy';

@Module({
  controllers: [ReportsController, IncidentReportsController],
  providers: [
    ReportDataService,
    ReportsService,
    PdfReportStrategy,
    XlsxReportStrategy,
    CsvReportStrategy,
    JsonReportStrategy,
    {
      provide: REPORT_STRATEGIES,
      inject: [
        PdfReportStrategy,
        XlsxReportStrategy,
        CsvReportStrategy,
        JsonReportStrategy,
      ],
      useFactory: (
        pdf: PdfReportStrategy,
        xlsx: XlsxReportStrategy,
        csv: CsvReportStrategy,
        json: JsonReportStrategy,
      ): ReportGenerationStrategy[] => [pdf, xlsx, csv, json],
    },
  ],
})
export class ReportsModule {}
