import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  IsArray,
  IsEmail,
  IsIn,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { SYSTEM_ROLE_NAMES } from '../constants/system-role-names';

export class CreateUserDto {
  @ApiProperty({ example: 'mlopez' })
  @IsString()
  @Matches(/^[a-zA-Z0-9._-]+$/)
  @MaxLength(50)
  username!: string;

  @ApiProperty({ example: 'mlopez@example.com' })
  @IsEmail()
  @MaxLength(255)
  email!: string;

  @ApiProperty({ example: 'María López' })
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  displayName!: string;

  @ApiProperty({ format: 'password', minLength: 12 })
  @IsString()
  @MinLength(12)
  password!: string;

  @ApiProperty({
    enum: SYSTEM_ROLE_NAMES,
    isArray: true,
    example: ['NOC_OPERATOR'],
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsIn(SYSTEM_ROLE_NAMES, { each: true })
  roleNames!: string[];
}
