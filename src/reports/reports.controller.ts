import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import { Report } from '@prisma/client';
import { createReadStream } from 'node:fs';
import { Permissions } from '../common/decorators/permissions.decorator';
import type { AuthenticatedRequest } from '../auth/interfaces/authenticated-request.interface';
import type { Response } from 'express';
import { GenerateReportDto } from './dto/generate-report.dto';
import { ListReportsQueryDto } from './dto/list-reports-query.dto';
import { ReportsService } from './reports.service';

@ApiTags('Reports')
@ApiBearerAuth('access-token')
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get()
  @Permissions('report.read')
  @ApiOperation({
    summary: 'Lists generated reports with pagination and filters',
  })
  list(
    @Query() query: ListReportsQueryDto,
  ): Promise<{ data: Report[]; total: number; page: number; limit: number }> {
    return this.reportsService.list(query);
  }

  @Post('generate')
  @Permissions('report.generate')
  @ApiOperation({
    summary: 'Generates and stores a PDF, XLSX, CSV, or JSON report',
  })
  generate(
    @Body() dto: GenerateReportDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<Report> {
    return this.reportsService.generate(dto, request.user.username);
  }

  @Get(':id/download')
  @Permissions('report.read')
  @ApiOperation({ summary: 'Downloads a completed report file' })
  @ApiProduces('application/pdf', 'application/json', 'text/csv')
  async download(
    @Param('id') id: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const result = await this.reportsService.download(id);
    response.setHeader('Content-Type', result.contentType);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${result.report.fileName}"`,
    );
    return new StreamableFile(createReadStream(result.absolutePath));
  }

  @Get(':id')
  @Permissions('report.read')
  @ApiOperation({ summary: 'Returns report metadata and generation status' })
  getById(@Param('id') id: string): Promise<Report> {
    return this.reportsService.findById(id);
  }
}
