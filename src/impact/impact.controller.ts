import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IncidentCustomer } from '@prisma/client';
import { Permissions } from '../common/decorators/permissions.decorator';
import { ListIncidentCustomersQueryDto } from './dto/list-incident-customers-query.dto';
import {
  ImpactEngineService,
  type ImpactSummary,
} from './impact-engine.service';

@ApiTags('Impact')
@ApiBearerAuth('access-token')
@Controller('incidents')
export class ImpactController {
  constructor(private readonly impactEngine: ImpactEngineService) {}

  @Get(':id/customers')
  @Permissions('incident.read')
  @ApiOperation({
    summary:
      'Lists customers associated with an incident and their impact status',
  })
  customers(
    @Param('id') id: string,
    @Query() query: ListIncidentCustomersQueryDto,
  ): Promise<{
    data: IncidentCustomer[];
    total: number;
    page: number;
    limit: number;
  }> {
    return this.impactEngine.listCustomers(id, query);
  }

  @Post(':id/impact/refresh')
  @Permissions('incident.update')
  @ApiOperation({
    summary:
      'Refreshes customer impact from api_zaSmaOlt through the configured adapter',
  })
  refresh(@Param('id') id: string): Promise<ImpactSummary> {
    return this.impactEngine.refreshByIncidentId(id);
  }
}
