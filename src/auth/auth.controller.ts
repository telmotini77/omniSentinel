import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../common/decorators/public.decorator';
import type { AuthenticatedRequest } from './interfaces/authenticated-request.interface';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { TokenResponseDto } from './dto/token-response.dto';
import type { SafeUser } from '../users/users.service';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Authenticates a user and returns access and refresh JWT tokens',
  })
  @ApiOkResponse({ type: TokenResponseDto })
  login(
    @Body() dto: LoginDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<TokenResponseDto> {
    return this.authService.login(
      dto.identity,
      dto.password,
      this.clientContext(request),
    );
  }

  @Post('refresh')
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({
    summary:
      'Rotates a refresh token and returns a new access and refresh token pair',
  })
  @ApiOkResponse({ type: TokenResponseDto })
  refresh(
    @Body() dto: RefreshTokenDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<TokenResponseDto> {
    return this.authService.refresh(dto, this.clientContext(request));
  }

  @Post('logout')
  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revokes a refresh token' })
  async logout(@Body() dto: RefreshTokenDto): Promise<void> {
    await this.authService.logout(dto);
  }

  @Get('me')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Returns the authenticated user profile and effective permissions',
  })
  profile(@Req() request: AuthenticatedRequest): Promise<SafeUser> {
    return this.authService.profile(request.user.sub);
  }

  private clientContext(request: AuthenticatedRequest): {
    ipAddress?: string;
    userAgent?: string;
  } {
    return { ipAddress: request.ip, userAgent: request.headers['user-agent'] };
  }
}
