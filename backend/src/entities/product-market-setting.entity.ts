import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('product_market_settings')
export class ProductMarketSetting {
  @PrimaryColumn()
  id: string;

  @Column()
  productId: string;

  @Column()
  marketId: string;

  @Column({ default: false })
  enabled: boolean;

  @Column({ default: false })
  autopilotEnabled: boolean;

  @Column({ default: 'XPF' })
  currency: string;

  @Column({ type: 'varchar', nullable: true })
  priceLabel: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
