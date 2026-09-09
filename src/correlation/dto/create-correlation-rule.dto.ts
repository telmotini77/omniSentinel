import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AlertSeverity, IncidentType, RootCause } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateCorrelationRuleDto {
  @ApiProperty({ example: 'multiple-onu-on-a-pon' })
  @IsString()
  @Matches(/^[a-z0-9-]+$/)
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional({ example: 'Escalate multiple ONU events on one PON.' })
  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  description?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({ default: 100, minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  priority?: number;

  @ApiProperty({
    example: 'onu.offline',
    description: 'Exact event, prefix such as onu.*, or *.',
  })
  @IsString()
  @Matches(/^(\*|[a-z0-9]+(?:\.[a-z0-9]+)*(?:\.\*)?)$/)
  @MaxLength(120)
  eventPattern!: string;

  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  minimumEventCount?: number;

  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  minimumDistinctOnus?: number;

  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  minimumAffectedCustomers?: number;

  @ApiPropertyOptional({ enum: IncidentType })
  @IsOptional()
  @IsEnum(IncidentType)
  incidentType?: IncidentType;

  @ApiPropertyOptional({ enum: RootCause })
  @IsOptional()
  @IsEnum(RootCause)
  rootCause?: RootCause;

  @ApiPropertyOptional({ minimum: 0, maximum: 100 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  rootCauseConfidence?: number;

  @ApiPropertyOptional({ enum: AlertSeverity })
  @IsOptional()
  @IsEnum(AlertSeverity)
  severity?: AlertSeverity;
}
