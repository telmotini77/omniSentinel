import { ApiPropertyOptional } from '@nestjs/swagger';
import { AlertSeverity, AlertSource, AlertStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class ListAlertsQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ default: 50, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 50;

  @ApiPropertyOptional({ enum: AlertSeverity })
  @IsOptional()
  @IsEnum(AlertSeverity)
  severity?: AlertSeverity;

  @ApiPropertyOptional({ enum: AlertStatus })
  @IsOptional()
  @IsEnum(AlertStatus)
  status?: AlertStatus;

  @ApiPropertyOptional({ enum: AlertSource })
  @IsOptional()
  @IsEnum(AlertSource)
  source?: AlertSource;

  @ApiPropertyOptional({ example: 'pon.down' })
  @IsOptional()
  @IsString()
  eventType?: string;

  @ApiPropertyOptional({ example: 'OLT-CUE-01' })
  @IsOptional()
  @IsString()
  oltExternalId?: string;

  @ApiPropertyOptional({ example: '1/4' })
  @IsOptional()
  @IsString()
  ponIdentifier?: string;

  @ApiPropertyOptional({ example: '2026-09-09T00:00:00-05:00' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ example: '2026-09-09T23:59:59-05:00' })
  @IsOptional()
  @IsDateString()
  endDate?: string;
}
