import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { getConfig } from './config.js';

const HEADER = 'Authorization';
const PREFIX = 'Bearer ';

export interface TokenPayload {
  sub: string;
  role: string;
  iat: number;
  exp: number;
}

export interface AuthUser {
  userId: string;
  role: string;
}

function base64url(data: Buffer): string {
  return data.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlDecode(str: string): Buffer {
  let b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4 !== 0) b64 += '=';
  return Buffer.from(b64, 'base64');
}

function sign(data: string, secret: string): string {
  return createHmac('sha256', secret).update(data).digest('base64url');
}

export function generateToken(userId: string, role: string = 'owner'): string {
  const config = getConfig();
  const now = Math.floor(Date.now() / 1000);

  const header = base64url(Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const payload = base64url(Buffer.from(JSON.stringify({
    sub: userId,
    role,
    iat: now,
    exp: now + config.auth.tokenExpiry,
  })));

  const signature = sign(`${header}.${payload}`, config.auth.secret);
  return `${header}.${payload}.${signature}`;
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    const config = getConfig();
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [header, payload, signature] = parts as [string, string, string];

    const expectedSig = sign(`${header}.${payload}`, config.auth.secret);
    const sigBuf = Buffer.from(signature, 'base64url');
    const expectedBuf = Buffer.from(expectedSig, 'base64url');

    if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
      return null;
    }

    const decoded = JSON.parse(base64urlDecode(payload).toString('utf-8')) as TokenPayload;

    if (decoded.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

    return decoded;
  } catch {
    return null;
  }
}

export function extractUser(req: Request): AuthUser | null {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith(PREFIX)) return null;

  const token = authHeader.slice(PREFIX.length);
  const payload = verifyToken(token);
  if (!payload) return null;

  return { userId: payload.sub, role: payload.role };
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const user = extractUser(req);
  if (!user) {
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Missing or invalid authentication token',
    });
    return;
  }

  (req as any).user = user;
  next();
}

export function ownerOnly(req: Request, res: Response, next: NextFunction): void {
  const user = (req as any).user as AuthUser | undefined;
  if (!user || user.role !== 'owner') {
    res.status(403).json({
      error: 'Forbidden',
      message: 'Owner role required',
    });
    return;
  }
  next();
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = createHmac('sha256', salt).update(password).digest('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const computed = createHmac('sha256', salt).update(password).digest('hex');
  const hashBuf = Buffer.from(hash, 'hex');
  const computedBuf = Buffer.from(computed, 'hex');
  if (hashBuf.length !== computedBuf.length) return false;
  return timingSafeEqual(hashBuf, computedBuf);
}
