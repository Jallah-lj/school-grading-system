import crypto from 'crypto';
import jwt, { SignOptions } from 'jsonwebtoken';
import { env } from '../config/env';

export interface AccessTokenPayload {
  sub: string;
  role: string;
  email: string;
  name: string;
}

export interface RefreshTokenPayload {
  sub: string;
  role: string;
  jti: string;
}

interface TokenUser {
  id: string;
  role: string;
  email: string;
  name: string;
}

export function signAccessToken(user: TokenUser): string {
  const payload: AccessTokenPayload = { sub: user.id, role: user.role, email: user.email, name: user.name };
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.ACCESS_TOKEN_TTL as SignOptions['expiresIn'],
  });
}

export function signRefreshToken(user: TokenUser): { token: string; tokenHash: string; expiresAt: Date } {
  const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
  const token = jwt.sign({ sub: user.id, role: user.role }, env.JWT_REFRESH_SECRET, {
    expiresIn: Math.floor(env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60), // seconds
    jwtid: crypto.randomUUID(),
  });
  return { token, tokenHash: hashToken(token), expiresAt };
}

export const hashToken = (token: string): string =>
  crypto.createHash('sha256').update(token).digest('hex');

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenPayload;
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as RefreshTokenPayload;
}
