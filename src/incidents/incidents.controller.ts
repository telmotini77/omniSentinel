import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Incident } from '@prisma/client';
import { Permissions } from '../common/decorators/permissions.decorator';
import type { AuthenticatedRequest } from '../auth/interfaces/authenticated-request.interface';
import { ChangeIncidentStatusDto } from './dto/change-incident-status.dto';
import { IncidentActionDto } from './dto/incident-action.dto';
import { ListIncidentsQueryDto } from './dto/list-incidents-query.dto';
import { IncidentsService } from './incidents.service';

@ApiTags('Incidents')
@ApiBearerAuth('access-token')
@Controller('incidents')
export class IncidentsController {
  constructor(private readonly incidentsService: IncidentsService) {}

  @Get()
  @Permissions('incident.read')
  @ApiOperation({
    summary: 'Lists incidents with pagination and operational filters',
  })
  list(
    @Query() query: ListIncidentsQueryDto,
  ): Promise<{ data: Incident[]; total: number; page: number; limit: number }> {
    return this.incidentsService.list(query);
  }

  @Get(':id/timeline')
  @Permissions('incident.read')
  @ApiOperation({
    summary: 'Returns the complete chronological timeline for an incident',
  })
  timeline(@Param('id') id: string) {
    return this.incidentsService.timeline(id);
  }

  @Get(':id/events')
  @Permissions('incident.read')
  @ApiOperation({
    summary: 'Returns normalized alerts attached to an incident',
  })
  events(@Param('id') id: string) {
    return this.incidentsService.events(id);
  }

  @Get(':id')
  @Permissions('incident.read')
  @ApiOkResponse({ description: 'Incident found' })
  getById(@Param('id') id: string): Promise<Incident> {
    return this.incidentsService.getById(id);
  }

  @Post(':id/acknowledge')
  @Permissions('incident.update')
  @ApiOperation({
    summary: 'Acknowledges an incident and starts its investigation',
  })
  acknowledge(
    @Param('id') id: string,
    @Body() action: IncidentActionDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<Incident> {
    return this.incidentsService.acknowledge(id, action, request.user.username);
  }

  @Post(':id/status')
  @Permissions('incident.update')
  @ApiOperation({ summary: 'Applies a valid manual incident state transition' })
  transition(
    @Param('id') id: string,
    @Body() change: ChangeIncidentStatusDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<Incident> {
    return this.incidentsService.transition(id, change, request.user.username);
  }

  @Post(':id/resolve')
  @Permissions('incident.resolve')
  @ApiOperation({
    summary: 'Marks an incident as resolved after recovery is validated',
  })
  resolve(
    @Param('id') id: string,
    @Body() action: IncidentActionDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<Incident> {
    return this.incidentsService.resolve(id, action, request.user.username);
  }

  @Post(':id/close')
  @Permissions('incident.close')
  @ApiOperation({ summary: 'Closes a resolved incident' })
  close(
    @Param('id') id: string,
    @Body() action: IncidentActionDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<Incident> {
    return this.incidentsService.close(id, action, request.user.username);
  }
}
