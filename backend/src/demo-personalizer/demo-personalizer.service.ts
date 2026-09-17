import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Prospect } from '../entities/prospect.entity';
import { isPublicHttpUrl } from '../prospects/prospect.utils';
import { buildDemoPreparation } from './demo-personalizer.engine';
import { DEMO_RECIPES, getDemoRecipe } from './demo-recipes';

@Injectable()
export class DemoPersonalizerService {
  constructor(
    @InjectRepository(Prospect)
    private readonly prospects: Repository<Prospect>,
  ) {}

  recipes() {
    return DEMO_RECIPES;
  }

  recipe(productId: string) {
    const recipe = getDemoRecipe(productId);
    if (!recipe) throw new NotFoundException('Recette démo introuvable');
    return recipe;
  }

  async get(prospectId: string) {
    const prospect = await this.prospects.findOneBy({ id: prospectId });
    if (!prospect) throw new NotFoundException('Prospect introuvable');
    return prospect.demoPreparation ?? null;
  }

  async prepare(prospectId: string) {
    const prospect = await this.prospects.findOneBy({ id: prospectId });
    if (!prospect) throw new NotFoundException('Prospect introuvable');

    try {
      const previous = prospect.demoPreparation;
      const next = buildDemoPreparation(prospect);
      if (
        previous?.artifactStatus === 'generated' &&
        previous.productId === next.productId &&
        previous.artifactUrls?.length
      ) {
        next.artifactStatus = 'generated';
        next.artifactUrls = previous.artifactUrls;
        next.artifactGeneratedAt = previous.artifactGeneratedAt ?? null;
        next.artifactVersion = previous.artifactVersion ?? 1;
      }
      prospect.demoPreparation = next;
    } catch (err) {
      throw new BadRequestException(
        err instanceof Error ? err.message : 'Impossible de préparer la démo',
      );
    }

    await this.prospects.save(prospect);
    return prospect.demoPreparation;
  }

  async registerArtifacts(prospectId: string, artifactUrls: string[]) {
    const prospect = await this.prospects.findOneBy({ id: prospectId });
    if (!prospect) throw new NotFoundException('Prospect introuvable');
    const preparation = prospect.demoPreparation;
    if (!preparation) {
      throw new BadRequestException('Préparez d’abord le pack démo');
    }

    const recommendation = prospect.productRecommendation;
    if (
      !recommendation ||
      (recommendation.reviewState !== 'accepted' &&
        recommendation.reviewState !== 'overridden') ||
      recommendation.productId !== preparation.productId
    ) {
      throw new BadRequestException(
        'La recommandation produit validée ne correspond plus au pack démo',
      );
    }

    const urls = [
      ...new Set(
        artifactUrls.map((url) => url.trim()).filter((url) => Boolean(url)),
      ),
    ];
    if (!urls.length || urls.length > 6) {
      throw new BadRequestException('Enregistrez entre 1 et 6 artefacts');
    }
    if (urls.some((url) => !isPublicHttpUrl(url))) {
      throw new BadRequestException('Chaque artefact doit être une URL HTTP(S) publique');
    }

    preparation.artifactStatus = 'generated';
    preparation.artifactUrls = urls;
    preparation.artifactGeneratedAt = new Date().toISOString();
    preparation.artifactVersion = (preparation.artifactVersion ?? 0) + 1;
    prospect.demoPreparation = preparation;
    await this.prospects.save(prospect);
    return preparation;
  }

  async clearArtifacts(prospectId: string) {
    const prospect = await this.prospects.findOneBy({ id: prospectId });
    if (!prospect) throw new NotFoundException('Prospect introuvable');
    if (!prospect.demoPreparation) {
      throw new BadRequestException('Aucun pack démo préparé');
    }

    prospect.demoPreparation.artifactStatus = 'not-generated';
    prospect.demoPreparation.artifactUrls = [];
    prospect.demoPreparation.artifactGeneratedAt = null;
    prospect.demoPreparation.artifactVersion =
      prospect.demoPreparation.artifactVersion ?? 0;
    await this.prospects.save(prospect);
    return prospect.demoPreparation;
  }
}
