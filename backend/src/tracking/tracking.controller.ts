import {
  Controller,
  Get,
  Header,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { TrackingService } from '../mail/campaign-send.service';
import {
  renderUnsubscribePage,
  type UnsubscribePageModel,
} from './unsubscribe-page';

const PIXEL_GIF = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64',
);

@Controller()
export class TrackingController {
  constructor(private readonly tracking: TrackingService) {}

  @Get('t/o/:token')
  @Header('Cache-Control', 'no-store, no-cache, must-revalidate, private')
  @Header('Content-Type', 'image/gif')
  async open(@Param('token') token: string, @Res() res: Response) {
    await this.tracking.recordOpen(stripGif(token));
    res.send(PIXEL_GIF);
  }

  @Get('t/c/:token')
  async click(
    @Param('token') token: string,
    @Query('u') u: string,
    @Res() res: Response,
  ) {
    const target = u || 'https://example.com';
    let safe = target;
    try {
      const parsed = new URL(target);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        safe = parsed.toString();
      }
    } catch {
      safe = 'https://example.com';
    }
    await this.tracking.recordClick(token, safe);
    res.redirect(302, safe);
  }

  /** Public unsubscribe page — one click via POST form. */
  @Get('u/:token')
  async unsubPage(
    @Param('token') token: string,
    @Query('done') done: string | undefined,
    @Res() res: Response,
  ) {
    const info = await this.tracking.getUnsubscribeInfo(token);
    let model: UnsubscribePageModel;

    if (!info.ok) {
      model = { state: 'invalid' };
    } else if (done === '1') {
      model = {
        state: 'success',
        email: info.toEmail,
        company: info.company,
      };
    } else if (info.alreadyUnsubscribed) {
      model = {
        state: 'already',
        email: info.toEmail,
        company: info.company,
      };
    } else {
      model = {
        state: 'confirm',
        token,
        email: info.toEmail,
        company: info.company,
      };
    }

    res.status(200).type('html').send(renderUnsubscribePage(model));
  }

  /** One-click unsubscribe (form submit + List-Unsubscribe-Post). */
  @Post('u/:token')
  async unsubOneClick(
    @Param('token') token: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const result = await this.tracking.unsubscribe(token);
    const wantsHtml =
      req.headers.accept?.includes('text/html') ||
      req.headers['content-type']?.includes('application/x-www-form-urlencoded');

    if (!result.ok) {
      if (wantsHtml) {
        return res
          .status(404)
          .type('html')
          .send(renderUnsubscribePage({ state: 'invalid' }));
      }
      return res.status(404).json({ ok: false });
    }

    if (wantsHtml) {
      return res.redirect(303, `/u/${encodeURIComponent(token)}?done=1`);
    }

    return res.status(200).json({
      ok: true,
      already: result.already,
      email: result.email,
    });
  }
}

function stripGif(token: string) {
  return token.replace(/\.gif$/i, '');
}
