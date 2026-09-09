import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';
import { MetricsService } from './metrics.service';

@Injectable()
export class MetricsAccessGuard implements CanActivate {
  constructor(
    private readonly configService: ConfigService,
    private readonly metricsService: MetricsService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    if (!this.metricsService.isEnabled()) {
      throw new NotFoundException({
        error: 'METRICS_DISABLED',
        message: 'Metrics endpoint is disabled',
      });
    }
    const expectedToken =
      this.configService.get<string>('METRICS_BEARER_TOKEN')?.trim() ?? '';
    if (!expectedToken) return true;
    const request = context.switchToHttp().getRequest<{
      headers: { authorization?: string };
    }>();
    const token = this.extractBearerToken(request.headers.authorization);
    if (!token || !this.tokensMatch(expectedToken, token)) {
      throw new UnauthorizedException({
        error: 'INVALID_METRICS_TOKEN',
        message: 'A valid metrics bearer token is required',
      });
    }
    return true;
  }

  private extractBearerToken(authorization?: string): string | undefined {
    const [scheme, token] = authorization?.split(' ') ?? [];
    return scheme === 'Bearer' && token ? token : undefined;
  }

  private tokensMatch(expected: string, received: string): boolean {
    const expectedBuffer = Buffer.from(expected);
    const receivedBuffer = Buffer.from(received);
    return (
      expectedBuffer.length === receivedBuffer.length &&
      timingSafeEqual(expectedBuffer, receivedBuffer)
    );
  }
}
