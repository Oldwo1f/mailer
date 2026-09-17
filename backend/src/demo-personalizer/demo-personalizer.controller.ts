import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { IsArray, IsString } from 'class-validator';
import { DemoPersonalizerService } from './demo-personalizer.service';

class RegisterArtifactsDto {
  @IsArray()
  @IsString({ each: true })
  artifactUrls: string[];
}

@Controller('demo-personalizer')
export class DemoPersonalizerController {
  constructor(private readonly demos: DemoPersonalizerService) {}

  @Get('recipes')
  recipes() {
    return this.demos.recipes();
  }

  @Get('recipes/:productId')
  recipe(@Param('productId') productId: string) {
    return this.demos.recipe(productId);
  }

  @Get(':prospectId')
  get(@Param('prospectId') prospectId: string) {
    return this.demos.get(prospectId);
  }

  @Post(':prospectId/prepare')
  prepare(@Param('prospectId') prospectId: string) {
    return this.demos.prepare(prospectId);
  }

  @Patch(':prospectId/artifacts')
  registerArtifacts(
    @Param('prospectId') prospectId: string,
    @Body() dto: RegisterArtifactsDto,
  ) {
    return this.demos.registerArtifacts(prospectId, dto.artifactUrls);
  }

  @Delete(':prospectId/artifacts')
  clearArtifacts(@Param('prospectId') prospectId: string) {
    return this.demos.clearArtifacts(prospectId);
  }
}
