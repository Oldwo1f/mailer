import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { ProductMarketService } from './product-market.service';

class UpdateProductMarketDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsBoolean()
  autopilotEnabled?: boolean;

  @IsOptional()
  @IsString()
  priceLabel?: string | null;
}

@Controller('commercial/product-markets')
export class ProductMarketController {
  constructor(private readonly productMarkets: ProductMarketService) {}

  @Get()
  list() {
    return this.productMarkets.list();
  }

  @Put(':productId/:marketId')
  update(
    @Param('productId') productId: string,
    @Param('marketId') marketId: string,
    @Body() dto: UpdateProductMarketDto,
  ) {
    return this.productMarkets.update(productId, marketId, dto);
  }
}
