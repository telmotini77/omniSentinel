import { Controller, Get, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Notification } from '@prisma/client';
import { Permissions } from '../common/decorators/permissions.decorator';
import { NotificationsService } from './notifications.service';

@ApiTags('Notifications')
@ApiBearerAuth('access-token')
@Controller('incidents')
export class IncidentNotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get(':id/notifications')
  @Permissions('incident.read')
  @ApiOperation({ summary: 'Lists notification deliveries for one incident' })
  listForIncident(@Param('id') id: string): Promise<Notification[]> {
    return this.notifications.listForIncident(id);
  }
}
