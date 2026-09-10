import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AlertSeverity, AlertSource } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsISO8601,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { NETWORK_EVENT_TYPES } from '../constants/network-event-types';
import { DeviceDto } from './device.dto';
import { EventMetricsDto } from './event-metrics.dto';
import { ExternalReferencesDto } from './external-references.dto';

export class NormalizedNetworkEventDto {
  @ApiProperty({ example: 'evt-983472' })
  @IsString()
  @MaxLength(150)
  eventId!: string;

  @ApiProperty({ enum: NETWORK_EVENT_TYPES, example: 'pon.down' })
  @IsIn(NETWORK_EVENT_TYPES)
  eventType!: string;

  @ApiProperty({ enum: AlertSeverity, example: AlertSeverity.CRITICAL })
  @IsEnum(AlertSeverity)
  severity!: AlertSeverity;

  @ApiProperty({
    enum: [AlertSource.API_ZASMAOLT],
    example: AlertSource.API_ZASMAOLT,
    description:
      'Only api_zaSmaOlt may publish events into OmniSentinel. Zabbix and Smart OLT remain behind that service.',
  })
  @IsIn([AlertSource.API_ZASMAOLT], {
    message:
      'source must be API_ZASMAOLT; direct Zabbix and Smart OLT ingestion is disabled',
  })
  source!: AlertSource;

  @ApiProperty({ example: '2026-09-09T09:32:00-05:00' })
  @IsISO8601({ strict: true })
  timestamp!: string;

  @ApiProperty({ type: DeviceDto })
  @ValidateNested()
  @Type(() => DeviceDto)
  device!: DeviceDto;

  @ApiPropertyOptional({ type: EventMetricsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => EventMetricsDto)
  metrics?: EventMetricsDto;

  @ApiPropertyOptional({ type: ExternalReferencesDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ExternalReferencesDto)
  externalReferences?: ExternalReferencesDto;

  @ApiPropertyOptional({ example: 'PON 1/4 is unreachable' })
  @IsOptional()
  @IsString()
  @MaxLength(4_000)
  message?: string;

  @ApiPropertyOptional({ example: 'ZTEGC123456' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  onuSerial?: string;

  @ApiPropertyOptional({ example: 'CLI-001' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  customerCode?: string;
}
