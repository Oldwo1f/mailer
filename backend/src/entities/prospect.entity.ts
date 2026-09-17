import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ProspectList } from './prospect-list.entity';
import type { ProductRecommendation } from '../product-matcher/product-matcher.types';
import type { DemoPreparation } from '../demo-personalizer/demo-personalizer.types';

export type ProspectEnrichment = {
  website?: string | null;
  activity?: string | null;
  location?: string | null;
  hook?: string | null;
  sources?: string[];
  enrichedAt?: string;
  provider?: string | null;
};

export type ProspectProfile = {
  type?: string | null;
  commune?: string | null;
  adresse?: string | null;
  telephones?: string[];
  sites_web?: string[];
  facebook?: string[];
  num_tahiti?: string | null;
  besoins?: string | null;
  description?: string | null;
  cuisine?: string | null;
  gps?: { lat?: number; lon?: number } | null;
  sources?: string[];
  source_url?: string | null;
  score_completude?: number | null;
  [key: string]: unknown;
};

export type LeadStatus =
  | 'new'
  | 'contacted'
  | 'replied'
  | 'interested'
  | 'demo'
  | 'meeting'
  | 'quote'
  | 'won'
  | 'lost';

@Entity('prospects')
export class Prospect {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  company: string;

  @Column({ type: 'simple-json' })
  emails: string[];

  @Column({ type: 'varchar', nullable: true })
  contactName: string | null;

  /**
   * Explicit commercial market. Existing prospects are Polynesian by default.
   * Future France/EUR prospecting must set this to `fr` instead of reusing PF rules.
   */
  @Column({ type: 'varchar', default: 'pf' })
  marketId: string;

  @Column({ type: 'simple-json', nullable: true })
  profile: ProspectProfile | null;

  @Column({ default: false })
  starred: boolean;

  @Column({ type: 'datetime', nullable: true })
  unsubscribedAt: Date | null;

  @Column({ type: 'simple-json', nullable: true })
  enrichment: ProspectEnrichment | null;

  @Column({ type: 'simple-json', nullable: true })
  productRecommendation: ProductRecommendation | null;

  @Column({ type: 'simple-json', nullable: true })
  demoPreparation: DemoPreparation | null;

  @Column({ type: 'varchar', default: 'new' })
  leadStatus: LeadStatus;

  @Column({ type: 'integer', nullable: true })
  dealValueXpf: number | null;

  @Column({ type: 'datetime', nullable: true })
  replyDetectedAt: Date | null;

  @Column({ type: 'varchar', nullable: true })
  lastReplyFrom: string | null;

  @Column({ type: 'text', nullable: true })
  lastReplySubject: string | null;

  @Column({ type: 'varchar', nullable: true })
  lastReplyMessageId: string | null;

  @Column({ type: 'varchar', nullable: true })
  lastReplyIntent: string | null;

  @Column({ type: 'real', nullable: true })
  lastReplyConfidence: number | null;

  @Column({ type: 'text', nullable: true })
  lastReplySnippet: string | null;

  @Column({ type: 'text', nullable: true })
  nextCommercialAction: string | null;

  @Column({ type: 'datetime', nullable: true })
  autoReplySentAt: Date | null;

  @Column({ type: 'datetime', nullable: true })
  wonAt: Date | null;

  @Column({ type: 'text', nullable: true })
  lostReason: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @ManyToMany(() => ProspectList, (list) => list.prospects)
  lists: ProspectList[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
