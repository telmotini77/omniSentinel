import { Controller, Get, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Report } from '@prisma/client';
import { Permissions } from '../common/decorators/permissions.decorator';
import { ReportsService } from './reports.service';

@ApiTags('Reports')
@ApiBearerAuth('access-token')
@Controller('incidents')
export class IncidentReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get(':id/reports')
  @Permissions('report.read')
  @ApiOperation({ summary: 'Lists report metadata for one incident' })
  listForIncident(@Param('id') id: string): Promise<Report[]> {
    return this.reportsService.listForIncident(id);
  }
}
