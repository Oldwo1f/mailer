import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';

function contextWithCookie(cookie?: string): ExecutionContext {
  return {
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
    switchToHttp: () => ({
      getRequest: () => ({ headers: { cookie } }),
    }),
  } as unknown as ExecutionContext;
}

describe('AuthGuard', () => {
  it('rejects a private request without a valid session', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(false),
    } as unknown as Reflector;
    const auth = {
      readSessionToken: jest.fn().mockReturnValue(null),
      validateSession: jest.fn().mockReturnValue(false),
    } as unknown as AuthService;
    const guard = new AuthGuard(reflector, auth);

    expect(() => guard.canActivate(contextWithCookie())).toThrow(
      UnauthorizedException,
    );
  });

  it('allows routes explicitly marked public', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(true),
    } as unknown as Reflector;
    const auth = {} as AuthService;
    const guard = new AuthGuard(reflector, auth);

    expect(guard.canActivate(contextWithCookie())).toBe(true);
  });

  it('allows a private request with a valid session', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(false),
    } as unknown as Reflector;
    const auth = {
      readSessionToken: jest.fn().mockReturnValue('token'),
      validateSession: jest.fn().mockReturnValue(true),
    } as unknown as AuthService;
    const guard = new AuthGuard(reflector, auth);

    expect(guard.canActivate(contextWithCookie('mailer_session=token'))).toBe(true);
  });
});
