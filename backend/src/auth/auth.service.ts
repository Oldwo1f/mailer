import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  createHash,
  createHmac,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from 'crypto';
import { promisify } from 'util';

const scryptAsync = promisify(scryptCallback);

export const SESSION_COOKIE = 'mailer_session';

type SessionRecord = {
  expiresAt: number;
};

type FailureRecord = {
  count: number;
  resetAt: number;
};

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly revokedSessions = new Map<string, SessionRecord>();
  private readonly failures = new Map<string, FailureRecord>();

  async login(password: string, clientKey: string): Promise<string> {
    this.assertLoginAllowed(clientKey);

    const ok = await this.verifyPassword(password);
    if (!ok) {
      this.recordFailure(clientKey);
      this.logger.warn(`Admin login rejected for ${clientKey}`);
      throw new UnauthorizedException('Identifiants invalides');
    }

    this.failures.delete(clientKey);
    return this.createSessionToken();
  }

  validateSession(token: string | null | undefined): boolean {
    if (!token) return false;
    const now = Date.now();
    this.pruneSessions(now);
    const key = this.hashToken(token);
    if (this.revokedSessions.has(key)) return false;
    return this.verifySessionToken(token, now);
  }

  refreshSession(token: string | null | undefined): string | null {
    if (!this.validateSession(token)) return null;
    return this.createSessionToken();
  }

  logout(token: string | null | undefined) {
    if (!token) return;
    const expiresAt =
      this.tokenExpiresAt(token) || Date.now() + this.cookieMaxAgeMs();
    this.revokedSessions.set(this.hashToken(token), { expiresAt });
    this.pruneSessions();
  }

  readSessionToken(cookieHeader: string | undefined): string | null {
    if (!cookieHeader) return null;
    for (const item of cookieHeader.split(';')) {
      const idx = item.indexOf('=');
      if (idx <= 0) continue;
      const name = item.slice(0, idx).trim();
      if (name !== SESSION_COOKIE) continue;
      const value = item.slice(idx + 1).trim();
      try {
        return decodeURIComponent(value) || null;
      } catch {
        return value || null;
      }
    }
    return null;
  }

  cookieMaxAgeMs() {
    return this.sessionDays() * 86_400_000;
  }

  private createSessionToken() {
    const issuedAt = Date.now();
    const expiresAt = issuedAt + this.cookieMaxAgeMs();
    const nonce = randomBytes(24).toString('base64url');
    const payload = `v1.${issuedAt}.${expiresAt}.${nonce}`;
    const signature = createHmac('sha256', this.sessionSecret())
      .update(payload)
      .digest('base64url');
    return `${payload}.${signature}`;
  }

  private verifySessionToken(token: string, now = Date.now()) {
    const parts = token.split('.');
    if (parts.length !== 5 || parts[0] !== 'v1') return false;
    const payload = parts.slice(0, 4).join('.');
    const expected = createHmac('sha256', this.sessionSecret())
      .update(payload)
      .digest();
    let supplied: Buffer;
    try {
      supplied = Buffer.from(parts[4], 'base64url');
    } catch {
      return false;
    }
    if (
      supplied.length !== expected.length ||
      !timingSafeEqual(supplied, expected)
    ) {
      return false;
    }
    const expiresAt = Number(parts[2]);
    return Number.isFinite(expiresAt) && expiresAt > now;
  }

  private tokenExpiresAt(token: string) {
    const parts = token.split('.');
    if (parts.length !== 5 || parts[0] !== 'v1') return null;
    const expiresAt = Number(parts[2]);
    return Number.isFinite(expiresAt) ? expiresAt : null;
  }

  private sessionSecret() {
    const explicit = process.env.AUTH_SESSION_SECRET?.trim();
    if (explicit) return explicit;
    const passwordHash = process.env.ADMIN_PASSWORD_SCRYPT?.trim();
    if (!passwordHash) {
      throw new ServiceUnavailableException('Secret de session indisponible');
    }
    return createHash('sha256')
      .update(`aurel-session:${passwordHash}`)
      .digest();
  }

  private async verifyPassword(password: string): Promise<boolean> {
    const encoded = process.env.ADMIN_PASSWORD_SCRYPT?.trim();
    if (!encoded) {
      throw new ServiceUnavailableException(
        'ADMIN_PASSWORD_SCRYPT manquant sur le serveur',
      );
    }

    const [saltB64, expectedB64] = encoded.split(':');
    if (!saltB64 || !expectedB64) {
      throw new ServiceUnavailableException(
        'ADMIN_PASSWORD_SCRYPT invalide (format attendu: saltBase64:hashBase64)',
      );
    }

    let salt: Buffer;
    let expected: Buffer;
    try {
      salt = Buffer.from(saltB64, 'base64');
      expected = Buffer.from(expectedB64, 'base64');
    } catch {
      return false;
    }
    if (salt.length < 16 || expected.length < 32) return false;

    const derived = (await scryptAsync(
      password,
      salt,
      expected.length,
    )) as Buffer;
    return (
      derived.length === expected.length && timingSafeEqual(derived, expected)
    );
  }

  private assertLoginAllowed(clientKey: string) {
    const now = Date.now();
    const row = this.failures.get(clientKey);
    if (!row) return;
    if (row.resetAt <= now) {
      this.failures.delete(clientKey);
      return;
    }
    if (row.count >= this.maxLoginAttempts()) {
      throw new HttpException(
        'Trop de tentatives. Réessayez plus tard.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private recordFailure(clientKey: string) {
    const now = Date.now();
    const existing = this.failures.get(clientKey);
    if (!existing || existing.resetAt <= now) {
      this.failures.set(clientKey, {
        count: 1,
        resetAt: now + this.loginWindowMinutes() * 60_000,
      });
      return;
    }
    existing.count += 1;
    this.failures.set(clientKey, existing);
  }

  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private pruneSessions(now = Date.now()) {
    for (const [key, session] of this.revokedSessions) {
      if (session.expiresAt <= now) {
        this.revokedSessions.delete(key);
      }
    }
  }

  private envNumber(name: string, fallback: number) {
    const value = Number(process.env[name]);
    return Number.isFinite(value) && value > 0 ? value : fallback;
  }

  private sessionDays() {
    return Math.max(1, this.envNumber('AUTH_SESSION_DAYS', 30));
  }

  private maxLoginAttempts() {
    return Math.max(3, this.envNumber('AUTH_LOGIN_MAX_ATTEMPTS', 5));
  }

  private loginWindowMinutes() {
    return Math.max(1, this.envNumber('AUTH_LOGIN_WINDOW_MINUTES', 15));
  }
}
