import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SlaRecord } from '@prisma/client';
import { Permissions } from '../common/decorators/permissions.decorator';
import { AnalyticsPeriodQueryDto } from '../statistics/dto/analytics-period-query.dto';
import { CreateSlaSnapshotDto } from './dto/create-sla-snapshot.dto';
import { ListSlaRecordsQueryDto } from './dto/list-sla-records-query.dto';
import { SlaService } from './sla.service';
import type { SlaCalculation } from './sla.types';

@ApiTags('SLA')
@ApiBearerAuth('access-token')
@Controller('sla')
export class SlaController {
  constructor(private readonly slaService: SlaService) {}

  @Get()
  @Permissions('statistics.read')
  @ApiOperation({
    summary:
      'Calculates availability, downtime, MTTR and MTBF for a period and scope',
  })
  calculate(@Query() query: AnalyticsPeriodQueryDto): Promise<SlaCalculation> {
    return this.slaService.calculate(query);
  }

  @Get('snapshots')
  @Permissions('statistics.read')
  @ApiOperation({ summary: 'Lists persisted SLA calculation snapshots' })
  listSnapshots(@Query() query: ListSlaRecordsQueryDto): Promise<{
    data: SlaRecord[];
    total: number;
    page: number;
    limit: number;
  }> {
    return this.slaService.listSnapshots(query);
  }

  @Post('snapshots')
  @Permissions('configuration.update')
  @ApiOperation({
    summary: 'Calculates and persists an SLA snapshot for audit and reporting',
  })
  createSnapshot(@Body() dto: CreateSlaSnapshotDto): Promise<SlaRecord> {
    return this.slaService.createSnapshot(dto);
  }
}
