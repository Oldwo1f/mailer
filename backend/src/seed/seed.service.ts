import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Prospect } from '../entities/prospect.entity';
import { SenderIdentity } from '../entities/sender-identity.entity';
import { AppSettings } from '../entities/app-settings.entity';
import { ListsService } from '../lists/lists.service';

@Injectable()
export class SeedService implements OnModuleInit {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    @InjectRepository(Prospect)
    private readonly prospects: Repository<Prospect>,
    @InjectRepository(SenderIdentity)
    private readonly senders: Repository<SenderIdentity>,
    @InjectRepository(AppSettings)
    private readonly settings: Repository<AppSettings>,
    private readonly lists: ListsService,
  ) {}

  async onModuleInit() {
    await this.seedProspectLists();
    await this.seedSender();
    await this.seedSettings();
  }

  private async seedProspectLists() {
    const count = await this.prospects.count();
    if (count > 0) return;
    try {
      const result = await this.lists.installDefaults();
      this.logger.log(
        `Seeded PF lists: ${result.lists} lists, ${result.imported} prospects`,
      );
    } catch (err) {
      this.logger.warn(
        `Could not seed PF lists: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  private async seedSender() {
    const count = await this.senders.count();
    const name = process.env.MAIL_FROM_NAME || "Nouvel'Hair";
    const email =
      process.env.MAIL_FROM || 'nouvelhaire@nouvelhair-tahiti.com';
    if (count > 0) {
      const existing = await this.senders.findOneBy({ email });
      if (!existing) {
        await this.senders.save(
          this.senders.create({
            name,
            email,
            replyTo: null,
            isDefault: false,
          }),
        );
        this.logger.log(`Added aitoflow sender ${email}`);
      }
      return;
    }
    await this.senders.save(
      this.senders.create({
        name,
        email,
        replyTo: null,
        isDefault: true,
      }),
    );
    this.logger.log('Seeded default sender identity');
  }

  private async seedSettings() {
    const existing = await this.settings.findOneBy({ id: 'default' });
    const defaults = {
      sendDelayMs: Number(process.env.SEND_DELAY_MS) || 30000,
      openaiModel: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      mailserverUrl:
        process.env.MAILSERVER_URL || 'http://mailserver:3000',
      publicUrl:
        process.env.PUBLIC_URL || 'https://mailing.aito-flow.com',
      mailProvider: process.env.MAIL_PROVIDER || 'auto',
      mailFrom: process.env.MAIL_FROM || '',
      mailFromName: process.env.MAIL_FROM_NAME || '',
      smtpHost: process.env.SMTP_HOST || '',
      smtpPort: Number(process.env.SMTP_PORT) || 587,
      smtpSecure: process.env.SMTP_SECURE === 'true',
    };
    if (existing) {
      existing.values = {
        ...(existing.values ?? {}),
        ...defaults,
        ...existing.values,
      };
      if (!existing.values.mailProvider) {
        existing.values.mailProvider = defaults.mailProvider;
      }
      await this.settings.save(existing);
      return;
    }
    await this.settings.save(
      this.settings.create({
        id: 'default',
        values: defaults,
      }),
    );
    this.logger.log('Seeded app settings');
  }
}
