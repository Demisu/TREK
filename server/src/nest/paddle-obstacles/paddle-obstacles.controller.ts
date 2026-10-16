import { ADDON_IDS } from '../../addons';
import { AddonGuard } from '../addons/addon.guard';
import { RequireAddon } from '../addons/require-addon.decorator';
import { AdminGuard } from '../auth-core/admin.guard';
import { JwtAuthGuard } from '../auth-core/jwt-auth.guard';
import { ResponseContract } from '../common/response-contract';
import { PaddleObstaclesQueryDto, PaddleRegionCatalogQueryDto, PaddleRegionRequestDto } from './paddle-obstacles.dto';
import { PaddleObstaclesService } from './paddle-obstacles.service';
import { PaddleRegionsService } from './paddle-regions.service';
import { Body, Controller, Get, HttpCode, Post, Query, UseGuards } from '@nestjs/common';
import {
  paddleObstaclesResponseSchema,
  paddleRegionCatalogResponseSchema,
  paddleRegionListResponseSchema,
  paddleRegionSchema,
  successResponseSchema,
} from '@trek/shared';

/**
 * GET /api/paddle/obstacles?bbox=: the paddle objects of a map area and its
 * coverage (PAD-05A), for anyone signed in while Tours is on. The data is
 * OpenStreetMap's, read from regional extracts, not trip data.
 */
@Controller('api/paddle')
@UseGuards(AddonGuard, JwtAuthGuard)
@RequireAddon(ADDON_IDS.TOURS, 'Tours')
export class PaddleObstaclesController {
  constructor(private readonly obstacles: PaddleObstaclesService) {}

  @Get('obstacles')
  @ResponseContract(paddleObstaclesResponseSchema)
  async inBox(@Query() query: PaddleObstaclesQueryDto) {
    return await this.obstacles.inBox(query.bbox);
  }
}

/**
 * /api/admin/paddle-regions: which regions TREK reads paddle data for. The
 * list, Geofabrik's catalogue to pick from, adding (which starts the first
 * read), reading again and removing. Ids travel in the body or the query:
 * Geofabrik's are plain words, but a route segment is no place for a choice
 * that names an outside source.
 */
@Controller('api/admin/paddle-regions')
@UseGuards(JwtAuthGuard, AdminGuard)
export class PaddleRegionsController {
  constructor(private readonly regions: PaddleRegionsService) {}

  @Get()
  @ResponseContract(paddleRegionListResponseSchema)
  async list() {
    return { regions: await this.regions.list() };
  }

  @Get('catalog')
  @ResponseContract(paddleRegionCatalogResponseSchema)
  async catalog(@Query() query: PaddleRegionCatalogQueryDto) {
    return { regions: await this.regions.catalog(query.q) };
  }

  @Post()
  @ResponseContract(paddleRegionSchema)
  async add(@Body() body: PaddleRegionRequestDto) {
    return await this.regions.add(body.id);
  }

  @Post('refresh')
  @HttpCode(200)
  @ResponseContract(paddleRegionSchema)
  async refresh(@Body() body: PaddleRegionRequestDto) {
    return await this.regions.refresh(body.id);
  }

  @Post('remove')
  @HttpCode(200)
  @ResponseContract(successResponseSchema)
  async remove(@Body() body: PaddleRegionRequestDto) {
    await this.regions.remove(body.id);
    return { success: true as const };
  }
}
