import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class IncidentActionDto {
  @ApiPropertyOptional({ example: 'Operator reviewed the incoming alerts.' })
  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  note?: string;
}
