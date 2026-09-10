import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import type { ExternalNapStatus } from '../../integrations/zasmaolt/zasmaolt.adapter';

export class ListNapsQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 50, minimum: 1, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @ApiPropertyOptional({ description: 'NAP or OLT text to search' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  search?: string;

  @ApiPropertyOptional({ description: 'Exact OLT identifier' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  oltId?: string;

  @ApiPropertyOptional({ enum: ['ONLINE', 'PARTIAL', 'OFFLINE', 'UNKNOWN'] })
  @IsOptional()
  @IsIn(['ONLINE', 'PARTIAL', 'OFFLINE', 'UNKNOWN'])
  status?: ExternalNapStatus;
}
