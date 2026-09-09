import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ExternalReferencesDto {
  @ApiPropertyOptional({ example: '912834' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  zabbixEventId?: string;

  @ApiPropertyOptional({ example: '3' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  smartoltOltId?: string;
}
