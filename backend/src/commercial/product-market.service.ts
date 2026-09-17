import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProductMarketSetting } from '../entities/product-market-setting.entity';
import {
  PRODUCT_MARKET_PROFILES,
  getProductMarketProfile,
  type MarketId,
  type ProductId,
  type ProductMarketProfile,
} from './product-market';

export type ProductMarketState = ProductMarketProfile & {
  enabled: boolean;
  autopilotEnabled: boolean;
  effectivePriceLabel: string | null;
  overridden: boolean;
};

@Injectable()
export class ProductMarketService {
  constructor(
    @InjectRepository(ProductMarketSetting)
    private readonly settings: Repository<ProductMarketSetting>,
  ) {}

  private key(productId: string, marketId: string) {
    return `${productId}:${marketId}`;
  }

  async list(): Promise<ProductMarketState[]> {
    const overrides = await this.settings.find();
    const byId = new Map(overrides.map((row) => [row.id, row]));
    return PRODUCT_MARKET_PROFILES.map((profile) => {
      const override = byId.get(this.key(profile.productId, profile.marketId));
      return {
        ...profile,
        enabled: override?.enabled ?? profile.defaultEnabled,
        autopilotEnabled:
          override?.autopilotEnabled ?? profile.defaultAutopilotEnabled,
        effectivePriceLabel: override?.priceLabel ?? profile.priceLabel,
        overridden: Boolean(override),
      };
    });
  }

  async get(productId: string, marketId: string): Promise<ProductMarketState | null> {
    const profile = getProductMarketProfile(productId, marketId);
    if (!profile) return null;
    const override = await this.settings.findOneBy({
      id: this.key(productId, marketId),
    });
    return {
      ...profile,
      enabled: override?.enabled ?? profile.defaultEnabled,
      autopilotEnabled:
        override?.autopilotEnabled ?? profile.defaultAutopilotEnabled,
      effectivePriceLabel: override?.priceLabel ?? profile.priceLabel,
      overridden: Boolean(override),
    };
  }

  async isEnabled(productId: string, marketId: string) {
    return Boolean((await this.get(productId, marketId))?.enabled);
  }

  async isAutopilotEnabled(productId: string, marketId: string) {
    const state = await this.get(productId, marketId);
    return Boolean(state?.enabled && state.autopilotEnabled);
  }

  async update(
    productId: string,
    marketId: string,
    input: {
      enabled?: boolean;
      autopilotEnabled?: boolean;
      priceLabel?: string | null;
    },
  ) {
    const profile = getProductMarketProfile(productId, marketId);
    if (!profile) {
      throw new BadRequestException('Couple produit / marché inconnu');
    }

    const id = this.key(productId, marketId);
    const existing =
      (await this.settings.findOneBy({ id })) ||
      this.settings.create({
        id,
        productId: productId as ProductId,
        marketId: marketId as MarketId,
        enabled: profile.defaultEnabled,
        autopilotEnabled: profile.defaultAutopilotEnabled,
        currency: profile.currency,
        priceLabel: profile.priceLabel,
      });

    if (input.enabled !== undefined) existing.enabled = input.enabled;
    if (input.autopilotEnabled !== undefined) {
      existing.autopilotEnabled = input.autopilotEnabled;
    }
    if (input.priceLabel !== undefined) {
      existing.priceLabel = input.priceLabel?.trim() || null;
    }

    // A disabled market cannot execute Autopilot, even if its stored preference remains true.
    if (!existing.enabled) existing.autopilotEnabled = false;

    await this.settings.save(existing);
    return this.get(productId, marketId);
  }
}
