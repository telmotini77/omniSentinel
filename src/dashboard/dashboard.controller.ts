import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../common/decorators/permissions.decorator';
import { AnalyticsPeriodQueryDto } from '../statistics/dto/analytics-period-query.dto';
import { DashboardService } from './dashboard.service';

@ApiTags('Dashboard')
@ApiBearerAuth('access-token')
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('summary')
  @Permissions('statistics.read')
  @ApiOperation({
    summary: 'Returns the compact operational summary for the NOC dashboard',
  })
  summary(@Query() query: AnalyticsPeriodQueryDto) {
    return this.dashboardService.summary(query);
  }
}
