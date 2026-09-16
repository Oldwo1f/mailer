import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Campaign } from './campaign.entity';
import { Draft } from './draft.entity';

@Entity('campaign_steps')
export class CampaignStep {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  campaignId: string;

  @ManyToOne(() => Campaign, (c) => c.steps, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'campaignId' })
  campaign: Campaign;

  @Column({ type: 'int', default: 0 })
  position: number;

  @Column({ default: 'Email' })
  name: string;

  @Column({ type: 'text' })
  brief: string;

  /** Days to wait after the previous step finishes (0 for first step). */
  @Column({ type: 'int', default: 0 })
  delayDays: number;

  @OneToMany(() => Draft, (d) => d.step)
  drafts: Draft[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
