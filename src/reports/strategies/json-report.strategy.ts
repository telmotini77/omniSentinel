import { Injectable } from '@nestjs/common';
import { ReportFormat } from '@prisma/client';
import type {
  GeneratedReportFile,
  ReportDocument,
  ReportGenerationStrategy,
} from '../report-document';

@Injectable()
export class JsonReportStrategy implements ReportGenerationStrategy {
  readonly format = ReportFormat.JSON;

  generate(document: ReportDocument): Promise<GeneratedReportFile> {
    return Promise.resolve({
      extension: 'json',
      contentType: 'application/json; charset=utf-8',
      content: Buffer.from(JSON.stringify(document, null, 2), 'utf8'),
    });
  }
}
