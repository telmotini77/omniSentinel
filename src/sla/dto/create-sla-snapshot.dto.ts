import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { AnalyticsPeriodQueryDto } from '../../statistics/dto/analytics-period-query.dto';

export class CreateSlaSnapshotDto extends AnalyticsPeriodQueryDto {
  @ApiPropertyOptional({
    description:
      'Optional label retained as the snapshot scope key when no OLT, PON, or customer filter is used.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  label?: string;
}
