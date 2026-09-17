import {
  Controller,
  ForbiddenException,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../auth/public.decorator';
import { AurelTesterSmokeService } from './aurel-tester-smoke.service';

@Controller('internal/smoke')
export class AurelTesterSmokeController {
  constructor(private readonly smoke: AurelTesterSmokeService) {}

  @Public()
  @Post('testers')
  run(@Req() req: Request) {
    const address = req.socket.remoteAddress || '';
    const loopback =
      address === '127.0.0.1' ||
      address === '::1' ||
      address === '::ffff:127.0.0.1';
    if (!loopback) {
      throw new ForbiddenException('Smoke test accessible uniquement en localhost.');
    }
    return this.smoke.run();
  }
}
