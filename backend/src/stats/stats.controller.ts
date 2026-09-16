import { Controller, Get } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Send } from '../entities/send.entity';
import { Prospect } from '../entities/prospect.entity';
import { Campaign } from '../entities/campaign.entity';
import { Click } from '../entities/click.entity';

@Controller('stats')
export class StatsController {
  constructor(
    @InjectRepository(Send) private readonly sends: Repository<Send>,
    @InjectRepository(Prospect)
    private readonly prospects: Repository<Prospect>,
    @InjectRepository(Campaign)
    private readonly campaigns: Repository<Campaign>,
    @InjectRepository(Click) private readonly clicks: Repository<Click>,
  ) {}

  @Get('overview')
  async overview() {
    const [sent, opened, clicks, unsubscribed, prospects, campaigns, recent] =
      await Promise.all([
        this.sends.count({ where: { status: 'sent' } }),
        this.sends
          .createQueryBuilder('s')
          .where('s.openCount > 0')
          .getCount(),
        this.clicks.count(),
        this.prospects
          .createQueryBuilder('p')
          .where('p.unsubscribedAt IS NOT NULL')
          .getCount(),
        this.prospects.count(),
        this.campaigns.count(),
        this.campaigns.find({
          order: { createdAt: 'DESC' },
          take: 5,
          relations: ['sender'],
        }),
      ]);

    return {
      sent,
      opened,
      clicks,
      unsubscribed,
      prospects,
      campaigns,
      openRate: sent ? opened / sent : 0,
      recentCampaigns: recent,
    };
  }
}
