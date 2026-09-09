import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../common/decorators/permissions.decorator';
import { AnalyticsPeriodQueryDto } from './dto/analytics-period-query.dto';
import { StatisticsService } from './statistics.service';

@ApiTags('Statistics')
@ApiBearerAuth('access-token')
@Controller('statistics')
export class StatisticsController {
  constructor(private readonly statisticsService: StatisticsService) {}

  @Get()
  @Permissions('statistics.read')
  @ApiOperation({
    summary: 'Returns the consolidated operational analytics view',
  })
  overview(@Query() query: AnalyticsPeriodQueryDto) {
    return this.statisticsService.overview(query);
  }

  @Get('incidents')
  @Permissions('statistics.read')
  @ApiOperation({
    summary:
      'Returns incident trends, severity, root-cause, OLT and PON metrics',
  })
  incidents(@Query() query: AnalyticsPeriodQueryDto) {
    return this.statisticsService.incidents(query);
  }

  @Get('customers')
  @Permissions('statistics.read')
  @ApiOperation({
    summary: 'Returns impacted-customer and accumulated outage metrics',
  })
  customers(@Query() query: AnalyticsPeriodQueryDto) {
    return this.statisticsService.customers(query);
  }

  @Get('availability')
  @Permissions('statistics.read')
  @ApiOperation({ summary: 'Returns availability and reliability indicators' })
  availability(@Query() query: AnalyticsPeriodQueryDto) {
    return this.statisticsService.availability(query);
  }
}
