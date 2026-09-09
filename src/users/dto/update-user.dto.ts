import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { UserStatus } from '@prisma/client';
import { SYSTEM_ROLE_NAMES } from '../constants/system-role-names';

export class UpdateUserDto {
  @ApiPropertyOptional({ example: 'María López' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  displayName?: string;

  @ApiPropertyOptional({ enum: UserStatus })
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @ApiPropertyOptional({ enum: SYSTEM_ROLE_NAMES, isArray: true })
  @IsOptional()
  @IsArray()
  @IsIn(SYSTEM_ROLE_NAMES, { each: true })
  roleNames?: string[];

  @ApiPropertyOptional({ format: 'password', minLength: 12 })
  @IsOptional()
  @IsString()
  @MinLength(12)
  password?: string;
}
