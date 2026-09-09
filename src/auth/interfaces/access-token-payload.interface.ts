export interface AccessTokenPayload {
  sub: string;
  username: string;
  email: string;
  roles: string[];
  permissions: string[];
  tokenType: 'access';
}

export interface RefreshTokenPayload {
  sub: string;
  jti: string;
  tokenType: 'refresh';
}
