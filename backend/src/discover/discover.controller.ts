import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';
import { DiscoverService } from './discover.service';

class StartDiscoverDto {
  @IsString()
  @MinLength(2)
  keywords: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsUUID()
  listId?: string;

  @IsOptional()
  @IsString()
  newListName?: string;

  @Type(() => Number)
  @IsInt()
  @IsIn([10, 50, 100])
  batchSize: number;
}

@Controller('discover')
export class DiscoverController {
  constructor(private readonly discover: DiscoverService) {}

  @Get()
  list(@Query('status') status?: string) {
    return this.discover.listJobs(status || undefined);
  }

  @Post()
  start(@Body() dto: StartDiscoverDto) {
    return this.discover.start(dto);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.discover.findOne(id);
  }

  @Post(':id/cancel')
  cancel(@Param('id') id: string) {
    return this.discover.cancel(id);
  }
}
