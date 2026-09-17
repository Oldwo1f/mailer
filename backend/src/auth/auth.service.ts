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
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from 'crypto';
import { promisify } from 'util';

const scryptAsync = promisify(scryptCallback);

export const SESSION_COOKIE = 'mailer_session';

type SessionRecord = {
  absoluteExpiresAt: number;
  idleExpiresAt: number;
};

type FailureRecord = {
  count: number;
  resetAt: number;
};

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly sessions = new Map<string, SessionRecord>();
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
    const token = randomBytes(32).toString('base64url');
    const now = Date.now();
    const idleMs = this.idleMinutes() * 60_000;
    const absoluteMs = this.absoluteHours() * 3_600_000;
    this.sessions.set(this.hashToken(token), {
      idleExpiresAt: now + idleMs,
      absoluteExpiresAt: now + absoluteMs,
    });
    this.pruneSessions(now);
    return token;
  }

  validateSession(token: string | null | undefined): boolean {
    if (!token) return false;
    const key = this.hashToken(token);
    const session = this.sessions.get(key);
    if (!session) return false;

    const now = Date.now();
    if (session.absoluteExpiresAt <= now || session.idleExpiresAt <= now) {
      this.sessions.delete(key);
      return false;
    }

    session.idleExpiresAt = Math.min(
      session.absoluteExpiresAt,
      now + this.idleMinutes() * 60_000,
    );
    this.sessions.set(key, session);
    return true;
  }

  logout(token: string | null | undefined) {
    if (!token) return;
    this.sessions.delete(this.hashToken(token));
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
    return this.absoluteHours() * 3_600_000;
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

    const derived = (await scryptAsync(password, salt, expected.length)) as Buffer;
    return derived.length === expected.length && timingSafeEqual(derived, expected);
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
    for (const [key, session] of this.sessions) {
      if (session.absoluteExpiresAt <= now || session.idleExpiresAt <= now) {
        this.sessions.delete(key);
      }
    }
  }

  private envNumber(name: string, fallback: number) {
    const value = Number(process.env[name]);
    return Number.isFinite(value) && value > 0 ? value : fallback;
  }

  private idleMinutes() {
    return Math.max(5, this.envNumber('AUTH_IDLE_MINUTES', 30));
  }

  private absoluteHours() {
    return Math.max(1, this.envNumber('AUTH_ABSOLUTE_HOURS', 12));
  }

  private maxLoginAttempts() {
    return Math.max(3, this.envNumber('AUTH_LOGIN_MAX_ATTEMPTS', 5));
  }

  private loginWindowMinutes() {
    return Math.max(1, this.envNumber('AUTH_LOGIN_WINDOW_MINUTES', 15));
  }
}
