import { ApiProperty } from '@nestjs/swagger';
import type { SafeUser } from '../../users/users.service';

export class TokenResponseDto {
  @ApiProperty()
  accessToken!: string;

  @ApiProperty()
  refreshToken!: string;

  @ApiProperty({ example: 'Bearer' })
  tokenType!: 'Bearer';

  @ApiProperty({ example: 900 })
  expiresIn!: number;

  @ApiProperty()
  user!: SafeUser;
}
