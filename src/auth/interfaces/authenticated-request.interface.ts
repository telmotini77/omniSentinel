import type { Request } from 'express';
import type { AccessTokenPayload } from './access-token-payload.interface';

export type AuthenticatedRequest = Request & { user: AccessTokenPayload };
