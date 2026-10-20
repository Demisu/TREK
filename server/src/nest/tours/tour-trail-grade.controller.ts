import { ADDON_IDS } from '../../addons';
import { AddonGuard } from '../addons/addon.guard';
import { RequireAddon } from '../addons/require-addon.decorator';
import { JwtAuthGuard } from '../auth-core/jwt-auth.guard';
import { ResponseContract } from '../common/response-contract';
import { TripAccessGuard } from '../permissions/trip-access.guard';
import { TourTrailGradeDto } from './dto/tour-trail-grade.dto';
import { TourTrailGradeService } from './tour-trail-grade.service';
import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { tourTrailGradeResponseSchema } from '@trek/shared';

/**
 * BIK-05 and MAP-03 POST /api/trips/:tripId/tours/trail-grades: the trail
 * grades of the ways a tour runs on, mountain bike and SAC alike. A read, so anyone who sees the trip may
 * ask; the ways come in the body because the draft may not be saved yet.
 */
@Controller('api/trips/:tripId/tours')
@UseGuards(AddonGuard, JwtAuthGuard, TripAccessGuard)
@RequireAddon(ADDON_IDS.TOURS, 'Tours')
export class TourTrailGradeController {
  constructor(private readonly trailGrades: TourTrailGradeService) {}

  @Post('trail-grades')
  @HttpCode(200)
  @ResponseContract(tourTrailGradeResponseSchema)
  async grades(@Body() body: TourTrailGradeDto) {
    return await this.trailGrades.grades(body);
  }
}
