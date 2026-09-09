import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  AlertSeverity,
  IncidentStatus,
  IncidentType,
  RootCause,
} from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class AnalyticsPeriodQueryDto {
  @ApiPropertyOptional({
    format: 'date-time',
    description: 'Inclusive period start. Defaults to the previous 30 days.',
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({
    format: 'date-time',
    description: 'Inclusive period end. Defaults to the current instant.',
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ enum: AlertSeverity })
  @IsOptional()
  @IsEnum(AlertSeverity)
  severity?: AlertSeverity;

  @ApiPropertyOptional({ enum: IncidentStatus })
  @IsOptional()
  @IsEnum(IncidentStatus)
  status?: IncidentStatus;

  @ApiPropertyOptional({ enum: IncidentType })
  @IsOptional()
  @IsEnum(IncidentType)
  type?: IncidentType;

  @ApiPropertyOptional({ enum: RootCause })
  @IsOptional()
  @IsEnum(RootCause)
  rootCause?: RootCause;

  @ApiPropertyOptional({ example: 'OLT-CUE-01' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  oltExternalId?: string;

  @ApiPropertyOptional({ example: '1/4' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  ponIdentifier?: string;

  @ApiPropertyOptional({ example: 'CLI-001' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  customerCode?: string;
}
