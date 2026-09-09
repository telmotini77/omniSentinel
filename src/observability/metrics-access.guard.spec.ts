import { UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { ExecutionContext } from '@nestjs/common';
import { MetricsAccessGuard } from './metrics-access.guard';
import type { MetricsService } from './metrics.service';

function contextFor(authorization?: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers: { authorization } }),
    }),
  } as unknown as ExecutionContext;
}

describe('MetricsAccessGuard', () => {
  const token = 'metrics-token-which-is-long-enough-for-production';
  const config = {
    get: jest.fn().mockReturnValue(token),
  } as unknown as ConfigService;
  const metrics = {
    isEnabled: jest.fn().mockReturnValue(true),
  } as unknown as MetricsService;

  it('accepts the configured bearer token', () => {
    const guard = new MetricsAccessGuard(config, metrics);

    expect(guard.canActivate(contextFor(`Bearer ${token}`))).toBe(true);
  });

  it('rejects a missing or incorrect token without revealing the configured one', () => {
    const guard = new MetricsAccessGuard(config, metrics);

    expect(() => guard.canActivate(contextFor('Bearer invalid'))).toThrow(
      UnauthorizedException,
    );
  });
});
