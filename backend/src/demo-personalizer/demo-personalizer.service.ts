import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Prospect } from '../entities/prospect.entity';
import { buildDemoPreparation } from './demo-personalizer.engine';

@Injectable()
export class DemoPersonalizerService {
  constructor(
    @InjectRepository(Prospect)
    private readonly prospects: Repository<Prospect>,
  ) {}

  async get(prospectId: string) {
    const prospect = await this.prospects.findOneBy({ id: prospectId });
    if (!prospect) throw new NotFoundException('Prospect introuvable');
    return prospect.demoPreparation ?? null;
  }

  async prepare(prospectId: string) {
    const prospect = await this.prospects.findOneBy({ id: prospectId });
    if (!prospect) throw new NotFoundException('Prospect introuvable');

    try {
      prospect.demoPreparation = buildDemoPreparation(prospect);
    } catch (err) {
      throw new BadRequestException(
        err instanceof Error ? err.message : 'Impossible de préparer la démo',
      );
    }

    await this.prospects.save(prospect);
    return prospect.demoPreparation;
  }
}
