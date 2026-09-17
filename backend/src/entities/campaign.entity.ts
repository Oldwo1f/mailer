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
import { SenderIdentity } from './sender-identity.entity';
import { Draft } from './draft.entity';
import { CampaignStep } from './campaign-step.entity';

export type CampaignStatus =
  | 'draft'
  | 'generating'
  | 'review'
  | 'sending'
  | 'waiting'
  | 'sent'
  | 'failed';

@Entity('campaigns')
export class Campaign {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ type: 'text' })
  brief: string;

  @Column({ default: 'professionnel' })
  tone: string;

  @Column({ default: 'classique' })
  emailType: string;

  @Column({ default: 'fr' })
  language: string;

  @Column({ type: 'varchar', default: 'draft' })
  status: CampaignStatus;

  @Column({ type: 'uuid', nullable: true })
  senderId: string | null;

  @ManyToOne(() => SenderIdentity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'senderId' })
  sender: SenderIdentity | null;

  @Column({ type: 'simple-json', nullable: true })
  prospectIds: string[] | null;

  @Column({ type: 'simple-json', nullable: true })
  listIds: string[] | null;

  @Column({ type: 'varchar', nullable: true })
  aurelSource: string | null;

  @Column({ type: 'varchar', nullable: true })
  experimentKey: string | null;

  @Column({ type: 'varchar', nullable: true })
  experimentVariant: string | null;

  @Column({ type: 'int', default: 0 })
  currentStepIndex: number;

  @Column({ type: 'datetime', nullable: true })
  nextStepAt: Date | null;

  @OneToMany(() => CampaignStep, (step) => step.campaign)
  steps: CampaignStep[];

  @OneToMany(() => Draft, (draft) => draft.campaign)
  drafts: Draft[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
