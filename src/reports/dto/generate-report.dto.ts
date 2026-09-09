import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ReportFormat, ReportType } from '@prisma/client';
import {
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class GenerateReportDto {
  @ApiProperty({ enum: ReportType, example: ReportType.INCIDENT_REPORT })
  @IsEnum(ReportType)
  type!: ReportType;

  @ApiProperty({ enum: ReportFormat, example: ReportFormat.PDF })
  @IsEnum(ReportFormat)
  format!: ReportFormat;

  @ApiPropertyOptional({
    description: 'Required for a focused incident report.',
  })
  @IsOptional()
  @IsUUID()
  incidentId?: string;

  @ApiPropertyOptional({ example: '2026-09-01T00:00:00.000Z' })
  @IsOptional()
  @IsISO8601({ strict: true })
  startDate?: string;

  @ApiPropertyOptional({ example: '2026-09-30T23:59:59.999Z' })
  @IsOptional()
  @IsISO8601({ strict: true })
  endDate?: string;

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

  @ApiPropertyOptional({ example: 'CUE-0001' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  customerCode?: string;

  @ApiPropertyOptional({ example: 'Informe de incidencia PON 1/4' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;
}
