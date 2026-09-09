import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ description: 'Username or email address', example: 'admin' })
  @IsString()
  @MinLength(3)
  @MaxLength(255)
  identity!: string;

  @ApiProperty({ format: 'password' })
  @IsString()
  @MinLength(1)
  password!: string;
}
