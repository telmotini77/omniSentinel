import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  AlertSeverity,
  NotificationChannel,
  NotificationEvent,
} from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export class CreateNotificationRuleDto {
  @ApiProperty({ example: 'critical-incident-webhook' })
  @IsString()
  @Matches(/^[a-z0-9-]+$/)
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  description?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiProperty({ enum: NotificationEvent })
  @IsEnum(NotificationEvent)
  event!: NotificationEvent;

  @ApiProperty({ enum: NotificationChannel })
  @IsEnum(NotificationChannel)
  channel!: NotificationChannel;

  @ApiProperty({ enum: AlertSeverity, default: AlertSeverity.MAJOR })
  @IsEnum(AlertSeverity)
  minimumSeverity!: AlertSeverity;

  @ApiPropertyOptional({
    example: 'noc@example.com or https://example.com/hooks/noc',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1_000)
  destination?: string;
}
