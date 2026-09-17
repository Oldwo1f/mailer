import { randomBytes, scryptSync } from 'crypto';
import { AuthService } from './auth.service';

const originalEnv = { ...process.env };

function configurePassword(password = 'super-secret-password') {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  process.env.ADMIN_PASSWORD_SCRYPT = `${salt.toString('base64')}:${hash.toString('base64')}`;
  process.env.AUTH_IDLE_MINUTES = '30';
  process.env.AUTH_ABSOLUTE_HOURS = '12';
  process.env.AUTH_LOGIN_MAX_ATTEMPTS = '5';
  process.env.AUTH_LOGIN_WINDOW_MINUTES = '15';
}

describe('AuthService', () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
    configurePassword();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('creates and validates an opaque session for the correct password', async () => {
    const auth = new AuthService();
    const token = await auth.login('super-secret-password', 'test-client');

    expect(token).toBeTruthy();
    expect(auth.validateSession(token)).toBe(true);
  });

  it('rejects an invalid password', async () => {
    const auth = new AuthService();

    await expect(auth.login('wrong-password', 'test-client')).rejects.toThrow(
      'Identifiants invalides',
    );
  });

  it('invalidates the session on logout', async () => {
    const auth = new AuthService();
    const token = await auth.login('super-secret-password', 'test-client');

    auth.logout(token);
    expect(auth.validateSession(token)).toBe(false);
  });

  it('extracts the session cookie without exposing other cookies', () => {
    const auth = new AuthService();

    expect(
      auth.readSessionToken('foo=bar; mailer_session=abc123; theme=dark'),
    ).toBe('abc123');
  });
});
