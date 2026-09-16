import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
} from '@nestjs/common';
import { SendsService } from './sends.service';
import type { SendStatus } from '../entities/send.entity';

@Controller('sends')
export class SendsController {
  constructor(private readonly sends: SendsService) {}

  @Get()
  list(
    @Query('status') status?: string,
    @Query('campaignId') campaignId?: string,
    @Query('q') q?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.sends.list({
      status: (status as SendStatus | 'all') || 'all',
      campaignId: campaignId || undefined,
      q: q || undefined,
      limit: limit ? Number(limit) : 50,
      offset: offset ? Number(offset) : 0,
    });
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    const row = await this.sends.getOne(id);
    if (!row) throw new NotFoundException('Envoi introuvable');
    return row;
  }
}
