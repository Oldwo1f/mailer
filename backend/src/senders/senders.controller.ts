import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsBoolean, IsEmail, IsOptional, IsString } from 'class-validator';
import { Repository } from 'typeorm';
import { SenderIdentity } from '../entities/sender-identity.entity';

class SenderDto {
  @IsString()
  name: string;

  @IsEmail()
  email: string;

  @IsOptional()
  @IsString()
  replyTo?: string | null;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

@Controller('senders')
export class SendersController {
  constructor(
    @InjectRepository(SenderIdentity)
    private readonly senders: Repository<SenderIdentity>,
  ) {}

  @Get()
  list() {
    return this.senders.find({ order: { name: 'ASC' } });
  }

  @Post()
  async create(@Body() dto: SenderDto) {
    if (dto.isDefault) {
      await this.senders.update({ isDefault: true }, { isDefault: false });
    }
    return this.senders.save(
      this.senders.create({
        name: dto.name,
        email: dto.email,
        replyTo: dto.replyTo ?? null,
        isDefault: dto.isDefault ?? false,
      }),
    );
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: Partial<SenderDto>) {
    const row = await this.senders.findOneBy({ id });
    if (!row) return null;
    if (dto.isDefault) {
      await this.senders.update({ isDefault: true }, { isDefault: false });
    }
    Object.assign(row, dto);
    return this.senders.save(row);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    await this.senders.delete(id);
    return { ok: true };
  }
}
