import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

export type QuotaKind = 'search' | 'mail';
export type QuotaPeriodKind = 'daily' | 'monthly' | 'pool';

@Entity('provider_usage')
@Unique('UQ_provider_usage_kind_provider_period', [
  'kind',
  'provider',
  'periodKey',
])
@Index(['kind', 'provider'])
export class ProviderUsage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  kind: QuotaKind;

  @Column({ type: 'varchar' })
  provider: string;

  @Column({ type: 'varchar' })
  periodKind: QuotaPeriodKind;

  /** YYYY-MM-DD | YYYY-MM | lifetime */
  @Column({ type: 'varchar' })
  periodKey: string;

  @Column({ type: 'integer', default: 0 })
  used: number;

  @Column({ type: 'datetime', nullable: true })
  exhaustedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
