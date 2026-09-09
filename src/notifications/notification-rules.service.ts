import { Injectable, NotFoundException } from '@nestjs/common';
import { NotificationRule } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import type { CreateNotificationRuleDto } from './dto/create-notification-rule.dto';
import type { UpdateNotificationRuleDto } from './dto/update-notification-rule.dto';

@Injectable()
export class NotificationRulesService {
  constructor(private readonly prisma: PrismaService) {}

  list(): Promise<NotificationRule[]> {
    return this.prisma.notificationRule.findMany({ orderBy: { name: 'asc' } });
  }

  create(dto: CreateNotificationRuleDto): Promise<NotificationRule> {
    return this.prisma.notificationRule.create({ data: dto });
  }

  async update(
    id: string,
    dto: UpdateNotificationRuleDto,
  ): Promise<NotificationRule> {
    await this.findById(id);
    return this.prisma.notificationRule.update({ where: { id }, data: dto });
  }

  async remove(id: string): Promise<void> {
    await this.findById(id);
    await this.prisma.notificationRule.delete({ where: { id } });
  }

  private async findById(id: string): Promise<NotificationRule> {
    const rule = await this.prisma.notificationRule.findUnique({
      where: { id },
    });
    if (!rule) {
      throw new NotFoundException({
        error: 'NOTIFICATION_RULE_NOT_FOUND',
        message: 'Notification rule not found',
      });
    }
    return rule;
  }
}
