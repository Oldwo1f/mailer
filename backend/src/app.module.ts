import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { join } from 'path';
import { Prospect } from './entities/prospect.entity';
import { ProspectList } from './entities/prospect-list.entity';
import { SenderIdentity } from './entities/sender-identity.entity';
import { Campaign } from './entities/campaign.entity';
import { CampaignStep } from './entities/campaign-step.entity';
import { Draft } from './entities/draft.entity';
import { Send } from './entities/send.entity';
import { Click } from './entities/click.entity';
import { AppSettings } from './entities/app-settings.entity';
import { ProviderUsage } from './entities/provider-usage.entity';
import { ProductMarketSetting } from './entities/product-market-setting.entity';
import { AurelActionLog } from './entities/aurel-action-log.entity';
import { SeedService } from './seed/seed.service';
import { SettingsService } from './settings/settings.service';
import { SettingsController } from './settings/settings.controller';
import { WebSearchService } from './search/web-search.service';
import { LlmService } from './llm/llm.service';
import {
  EnrichmentService,
  ProspectsService,
} from './prospects/prospects.service';
import { ProspectsController } from './prospects/prospects.controller';
import { ListsService } from './lists/lists.service';
import { ListsController } from './lists/lists.controller';
import { CampaignsService } from './campaigns/campaigns.service';
import { CampaignsController } from './campaigns/campaigns.controller';
import { SendersController } from './senders/senders.controller';
import { MailRelayService } from './mail/mail-relay.service';
import { MailService } from './mail/mail.service';
import {
  CampaignSendService,
  TrackingService,
} from './mail/campaign-send.service';
import { TrackingController } from './tracking/tracking.controller';
import { StatsController } from './stats/stats.controller';
import { DraftsController } from './campaigns/drafts.controller';
import { HealthController } from './health/health.controller';
import { SendsService } from './sends/sends.service';
import { SendsController } from './sends/sends.controller';
import { QuotaService } from './quota/quota.service';
import { UsageController } from './quota/usage.controller';
import { DiscoveryJob } from './entities/discovery-job.entity';
import { DiscoverService } from './discover/discover.service';
import { DiscoverController } from './discover/discover.controller';
import { AuthController } from './auth/auth.controller';
import { AuthGuard } from './auth/auth.guard';
import { AuthService } from './auth/auth.service';
import { ProductMatcherService } from './product-matcher/product-matcher.service';
import { DemoPersonalizerController } from './demo-personalizer/demo-personalizer.controller';
import { DemoPersonalizerService } from './demo-personalizer/demo-personalizer.service';
import { CommercialPipelineController } from './commercial/commercial-pipeline.controller';
import { ReplyWebhookController } from './commercial/reply-webhook.controller';
import { CommercialPipelineService } from './commercial/commercial-pipeline.service';
import { ProductMarketController } from './commercial/product-market.controller';
import { ProductMarketService } from './commercial/product-market.service';
import { AurelAutopilotService } from './commercial/aurel-autopilot.service';
import { AcquisitionController } from './commercial/acquisition.controller';
import { AurelAcquisitionService } from './commercial/aurel-acquisition.service';
import { AurelJournalService } from './commercial/aurel-journal.service';
import { AurelDeferredFollowUpService } from './commercial/aurel-deferred-followup.service';
import { AurelReportService } from './commercial/aurel-report.service';
import { AurelCommandController } from './commercial/aurel-command.controller';

const entities = [
  Prospect,
  ProspectList,
  SenderIdentity,
  Campaign,
  CampaignStep,
  Draft,
  Send,
  Click,
  AppSettings,
  ProviderUsage,
  DiscoveryJob,
  ProductMarketSetting,
  AurelActionLog,
];

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        join(__dirname, '..', '..', '.env'),
        join(__dirname, '..', '.env'),
      ],
    }),
    TypeOrmModule.forRoot({
      type: 'better-sqlite3',
      database:
        process.env.DATABASE_PATH ||
        join(__dirname, '..', 'data', 'mailer.sqlite'),
      entities,
      synchronize: true,
    }),
    TypeOrmModule.forFeature(entities),
  ],
  controllers: [
    AuthController,
    HealthController,
    ProspectsController,
    DemoPersonalizerController,
    CommercialPipelineController,
    ProductMarketController,
    AcquisitionController,
    AurelCommandController,
    ReplyWebhookController,
    ListsController,
    CampaignsController,
    DraftsController,
    SendersController,
    SettingsController,
    TrackingController,
    StatsController,
    SendsController,
    UsageController,
    DiscoverController,
  ],
  providers: [
    AuthService,
    {
      provide: APP_GUARD,
      useClass: AuthGuard,
    },
    SeedService,
    SettingsService,
    QuotaService,
    WebSearchService,
    LlmService,
    ProspectsService,
    EnrichmentService,
    ProductMatcherService,
    DemoPersonalizerService,
    ProductMarketService,
    AurelJournalService,
    CommercialPipelineService,
    ListsService,
    CampaignsService,
    MailRelayService,
    MailService,
    CampaignSendService,
    AurelAutopilotService,
    AurelAcquisitionService,
    AurelDeferredFollowUpService,
    AurelReportService,
    TrackingService,
    SendsService,
    DiscoverService,
  ],
})
export class AppModule {}
