import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../database/prisma.service';
import {
  UsersService,
  type SafeUser,
  type UserWithAuthorization,
} from '../users/users.service';
import type { RefreshTokenDto } from './dto/refresh-token.dto';
import type { TokenResponseDto } from './dto/token-response.dto';
import type { RefreshTokenPayload } from './interfaces/access-token-payload.interface';

interface ClientContext {
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async login(
    identity: string,
    password: string,
    context: ClientContext,
  ): Promise<TokenResponseDto> {
    const user = await this.usersService.findForAuthentication(identity);
    if (
      !user ||
      user.status !== 'ACTIVE' ||
      !(await argon2.verify(user.passwordHash, password))
    ) {
      throw new UnauthorizedException({
        error: 'INVALID_CREDENTIALS',
        message: 'Invalid credentials',
      });
    }
    await this.usersService.markLogin(user.id);
    return this.issueTokens(user, context);
  }

  async refresh(
    dto: RefreshTokenDto,
    context: ClientContext,
  ): Promise<TokenResponseDto> {
    const payload = await this.verifyRefreshToken(dto.refreshToken);
    const storedToken = await this.prisma.refreshToken.findUnique({
      where: { id: payload.jti },
    });
    if (
      !storedToken ||
      storedToken.userId !== payload.sub ||
      storedToken.revokedAt ||
      storedToken.expiresAt <= new Date() ||
      !(await argon2.verify(storedToken.tokenHash, dto.refreshToken))
    ) {
      throw new UnauthorizedException({
        error: 'INVALID_REFRESH_TOKEN',
        message: 'Invalid refresh token',
      });
    }

    await this.prisma.refreshToken.update({
      where: { id: storedToken.id },
      data: { revokedAt: new Date() },
    });
    const user = await this.usersService.findByIdForAuthorization(payload.sub);
    if (user.status !== 'ACTIVE') {
      throw new UnauthorizedException({
        error: 'USER_INACTIVE',
        message: 'User account is not active',
      });
    }
    return this.issueTokens(user, context);
  }

  async logout(dto: RefreshTokenDto): Promise<void> {
    const payload = await this.verifyRefreshToken(dto.refreshToken);
    await this.prisma.refreshToken.updateMany({
      where: { id: payload.jti, userId: payload.sub, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async profile(userId: string): Promise<SafeUser> {
    return this.usersService.getById(userId);
  }

  private async issueTokens(
    user: UserWithAuthorization,
    context: ClientContext,
  ): Promise<TokenResponseDto> {
    const safeUser = this.usersService.toSafeUser(user);
    const accessTokenTtl = this.parseDurationSeconds(
      this.configService.getOrThrow<string>('JWT_ACCESS_TOKEN_TTL'),
    );
    const refreshTokenTtl =
      this.configService.getOrThrow<number>('JWT_REFRESH_TOKEN_TTL_DAYS') *
      86_400;
    const refreshTokenId = randomUUID();
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(
        {
          sub: user.id,
          username: user.username,
          email: user.email,
          roles: safeUser.roles,
          permissions: safeUser.permissions,
          tokenType: 'access',
        },
        {
          secret: this.configService.getOrThrow<string>('JWT_SECRET'),
          expiresIn: accessTokenTtl,
        },
      ),
      this.jwtService.signAsync(
        { sub: user.id, jti: refreshTokenId, tokenType: 'refresh' },
        {
          secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
          expiresIn: refreshTokenTtl,
        },
      ),
    ]);
    const expiresAt = new Date(Date.now() + refreshTokenTtl * 1_000);
    await this.prisma.refreshToken.create({
      data: {
        id: refreshTokenId,
        userId: user.id,
        tokenHash: await argon2.hash(refreshToken, { type: argon2.argon2id }),
        expiresAt,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
    });
    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: accessTokenTtl,
      user: safeUser,
    };
  }

  private async verifyRefreshToken(
    token: string,
  ): Promise<RefreshTokenPayload> {
    try {
      const payload = await this.jwtService.verifyAsync<RefreshTokenPayload>(
        token,
        {
          secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
        },
      );
      if (payload.tokenType !== 'refresh' || !payload.jti)
        throw new Error('Unexpected JWT payload');
      return payload;
    } catch {
      throw new UnauthorizedException({
        error: 'INVALID_REFRESH_TOKEN',
        message: 'Invalid refresh token',
      });
    }
  }

  private parseDurationSeconds(duration: string): number {
    const match = /^(\d+)([smhd])$/.exec(duration);
    if (!match)
      throw new Error('JWT_ACCESS_TOKEN_TTL must use s, m, h, or d suffix');
    const amount = Number(match[1]);
    const unitInSeconds: Record<string, number> = {
      s: 1,
      m: 60,
      h: 3_600,
      d: 86_400,
    };
    return amount * unitInSeconds[match[2]];
  }
}
