import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';

@Injectable()
export class IntegrationApiKeyGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expectedKey = this.configService.get<string>(
      'ZASMAOLT_INGEST_API_KEY',
    );
    if (!expectedKey) {
      throw new ServiceUnavailableException({
        error: 'INTEGRATION_NOT_CONFIGURED',
        message: 'The api_zaSmaOlt integration key is not configured',
      });
    }
    const request = context.switchToHttp().getRequest<Request>();
    const receivedKey = request.header('x-integration-api-key');
    if (!receivedKey || !this.keysMatch(expectedKey, receivedKey)) {
      throw new UnauthorizedException({
        error: 'INVALID_INTEGRATION_API_KEY',
        message: 'Invalid integration API key',
      });
    }
    return true;
  }

  private keysMatch(expected: string, received: string): boolean {
    const expectedBuffer = Buffer.from(expected);
    const receivedBuffer = Buffer.from(received);
    return (
      expectedBuffer.length === receivedBuffer.length &&
      timingSafeEqual(expectedBuffer, receivedBuffer)
    );
  }
}
