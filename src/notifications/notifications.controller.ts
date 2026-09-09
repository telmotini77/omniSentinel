import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Notification, NotificationRule } from '@prisma/client';
import { Permissions } from '../common/decorators/permissions.decorator';
import { CreateNotificationRuleDto } from './dto/create-notification-rule.dto';
import { ListNotificationsQueryDto } from './dto/list-notifications-query.dto';
import { UpdateNotificationRuleDto } from './dto/update-notification-rule.dto';
import { NotificationRulesService } from './notification-rules.service';
import { NotificationsService } from './notifications.service';

@ApiTags('Notifications')
@ApiBearerAuth('access-token')
@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly notificationRules: NotificationRulesService,
  ) {}

  @Get()
  @Permissions('incident.read')
  @ApiOperation({ summary: 'Lists notification delivery history' })
  list(@Query() query: ListNotificationsQueryDto): Promise<{
    data: Notification[];
    total: number;
    page: number;
    limit: number;
  }> {
    return this.notifications.list(query);
  }

  @Get('rules')
  @Permissions('configuration.update')
  @ApiOperation({ summary: 'Lists persisted notification rules' })
  listRules(): Promise<NotificationRule[]> {
    return this.notificationRules.list();
  }

  @Post('rules')
  @Permissions('configuration.update')
  @ApiOperation({ summary: 'Creates a notification rule' })
  createRule(
    @Body() dto: CreateNotificationRuleDto,
  ): Promise<NotificationRule> {
    return this.notificationRules.create(dto);
  }

  @Patch('rules/:id')
  @Permissions('configuration.update')
  @ApiOperation({ summary: 'Updates a notification rule' })
  updateRule(
    @Param('id') id: string,
    @Body() dto: UpdateNotificationRuleDto,
  ): Promise<NotificationRule> {
    return this.notificationRules.update(id, dto);
  }

  @Delete('rules/:id')
  @Permissions('configuration.update')
  @ApiOperation({ summary: 'Deletes a notification rule' })
  async removeRule(@Param('id') id: string): Promise<void> {
    await this.notificationRules.remove(id);
  }

  @Get(':id')
  @Permissions('incident.read')
  @ApiOperation({ summary: 'Returns one notification delivery record' })
  getById(@Param('id') id: string): Promise<Notification> {
    return this.notifications.findById(id);
  }
}
