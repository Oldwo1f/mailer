import { Body, Controller, Get, Post, Req, Res } from '@nestjs/common';
import { IsString, MinLength } from 'class-validator';
import type { Request, Response } from 'express';
import { AuthService, SESSION_COOKIE } from './auth.service';
import { Public } from './public.decorator';

class LoginDto {
  @IsString()
  @MinLength(8)
  password: string;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const clientKey = req.ip || req.socket.remoteAddress || 'unknown';
    const token = await this.auth.login(dto.password, clientKey);
    const production = process.env.NODE_ENV === 'production';

    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: production,
      sameSite: 'lax',
      path: '/',
      maxAge: this.auth.cookieMaxAgeMs(),
    });

    return { ok: true };
  }

  @Post('logout')
  logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = this.auth.readSessionToken(req.headers.cookie);
    this.auth.logout(token);
    res.clearCookie(SESSION_COOKIE, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
    });
    return { ok: true };
  }

  @Get('me')
  me(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const current = this.auth.readSessionToken(req.headers.cookie);
    const refreshed = this.auth.refreshSession(current);
    if (refreshed) {
      res.cookie(SESSION_COOKIE, refreshed, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: this.auth.cookieMaxAgeMs(),
      });
    }
    return { authenticated: true };
  }
}
