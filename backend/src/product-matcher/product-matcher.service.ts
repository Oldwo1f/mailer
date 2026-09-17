import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Prospect } from '../entities/prospect.entity';
import { PRODUCT_CATALOG, getProduct } from './product-catalog';
import { buildRecommendation } from './product-matcher.engine';
import type { ProductReviewState } from './product-matcher.types';

@Injectable()
export class ProductMatcherService {
  constructor(
    @InjectRepository(Prospect)
    private readonly prospects: Repository<Prospect>,
  ) {}

  catalog() {
    return PRODUCT_CATALOG.map((p) => ({
      id: p.id,
      name: p.name,
      demoTemplate: p.demoTemplate,
      productUrl: p.productUrl,
    }));
  }

  async matchOne(id: string) {
    const prospect = await this.prospects.findOneBy({ id });
    if (!prospect) throw new NotFoundException('Prospect introuvable');

    const next = buildRecommendation(prospect);
    const previous = prospect.productRecommendation;

    // A human decision always wins over a re-score until explicitly changed.
    if (previous && previous.reviewState !== 'unreviewed') {
      next.reviewState = previous.reviewState;
      next.reviewNote = previous.reviewNote ?? null;
      next.productId = previous.productId;
      next.productName = getProduct(previous.productId)?.name ?? previous.productName;
    }

    prospect.productRecommendation = next;
    await this.prospects.save(prospect);
    return prospect;
  }

  async matchMany(ids: string[]) {
    if (!ids.length) return [];
    const rows = await this.prospects.find({ where: { id: In(ids) } });
    const byId = new Map(rows.map((p) => [p.id, p]));
    const results: Array<{ id: string; ok: boolean; error?: string }> = [];

    for (const id of ids) {
      const prospect = byId.get(id);
      if (!prospect) {
        results.push({ id, ok: false, error: 'Prospect introuvable' });
        continue;
      }
      try {
        const next = buildRecommendation(prospect);
        const previous = prospect.productRecommendation;
        if (previous && previous.reviewState !== 'unreviewed') {
          next.reviewState = previous.reviewState;
          next.reviewNote = previous.reviewNote ?? null;
          next.productId = previous.productId;
          next.productName = getProduct(previous.productId)?.name ?? previous.productName;
        }
        prospect.productRecommendation = next;
        await this.prospects.save(prospect);
        results.push({ id, ok: true });
      } catch (err) {
        results.push({
          id,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return results;
  }

  async review(
    id: string,
    input: {
      reviewState: ProductReviewState;
      productId?: string | null;
      note?: string | null;
    },
  ) {
    const prospect = await this.prospects.findOneBy({ id });
    if (!prospect) throw new NotFoundException('Prospect introuvable');
    if (!prospect.productRecommendation) {
      throw new BadRequestException('Lancez d’abord le matching produit');
    }

    const recommendation = { ...prospect.productRecommendation };
    const state = input.reviewState;

    if (state === 'accepted') {
      recommendation.productId = recommendation.suggestedProductId;
      recommendation.productName =
        getProduct(recommendation.productId)?.name ?? recommendation.productName;
    } else if (state === 'overridden') {
      const product = input.productId ? getProduct(input.productId) : null;
      if (!product) {
        throw new BadRequestException('Produit de remplacement invalide');
      }
      recommendation.productId = product.id;
      recommendation.productName = product.name;
      recommendation.demoType = product.demoTemplate;
      recommendation.productUrl = product.productUrl;
      recommendation.recommendedAngle = product.commercialAngles[0] ?? '';
    } else if (state === 'unreviewed') {
      recommendation.productId = recommendation.suggestedProductId;
      recommendation.productName =
        getProduct(recommendation.productId)?.name ?? recommendation.productName;
    }

    recommendation.reviewState = state;
    recommendation.reviewNote = input.note?.trim() || null;
    prospect.productRecommendation = recommendation;
    await this.prospects.save(prospect);
    return prospect;
  }
}
