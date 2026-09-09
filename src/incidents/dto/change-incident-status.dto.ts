import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IncidentStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class ChangeIncidentStatusDto {
  @ApiProperty({ enum: IncidentStatus })
  @IsEnum(IncidentStatus)
  status!: IncidentStatus;

  @ApiPropertyOptional({ example: 'Validated by the NOC operator.' })
  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  note?: string;
}
