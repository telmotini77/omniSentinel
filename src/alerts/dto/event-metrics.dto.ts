import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, Min } from 'class-validator';

export class EventMetricsDto {
  @ApiPropertyOptional({ example: 32 })
  @IsOptional()
  @IsInt()
  @Min(0)
  onuTotal?: number;

  @ApiPropertyOptional({ example: 3 })
  @IsOptional()
  @IsInt()
  @Min(0)
  onuOnline?: number;

  @ApiPropertyOptional({ example: 29 })
  @IsOptional()
  @IsInt()
  @Min(0)
  onuOffline?: number;
}
