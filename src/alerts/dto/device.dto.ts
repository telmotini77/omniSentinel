import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class DeviceDto {
  @ApiProperty({ example: 'OLT-CUE-01' })
  @IsString()
  @MaxLength(150)
  oltId!: string;

  @ApiPropertyOptional({ example: 'OLT Cuenca 01' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  oltName?: string;

  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(0)
  board!: number;

  @ApiProperty({ example: 4 })
  @IsInt()
  @Min(0)
  pon!: number;
}
