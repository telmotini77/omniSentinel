import { Injectable } from '@nestjs/common';
import { ReportFormat } from '@prisma/client';
import puppeteer from 'puppeteer';
import type {
  GeneratedReportFile,
  ReportDocument,
  ReportGenerationStrategy,
} from '../report-document';
import { renderIncidentReportHtml } from '../templates/incident-report.template';

@Injectable()
export class PdfReportStrategy implements ReportGenerationStrategy {
  readonly format = ReportFormat.PDF;

  async generate(document: ReportDocument): Promise<GeneratedReportFile> {
    const browser = await puppeteer.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.setContent(renderIncidentReportHtml(document), {
        waitUntil: 'domcontentloaded',
      });
      const content = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '12mm', right: '10mm', bottom: '18mm', left: '10mm' },
      });
      return {
        extension: 'pdf',
        contentType: 'application/pdf',
        content: Buffer.from(content),
      };
    } finally {
      await browser.close();
    }
  }
}
