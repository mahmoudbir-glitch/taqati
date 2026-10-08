import { Controller, Get, Inject, Param, ParseIntPipe, Query } from "@nestjs/common";
import { TelemetryService } from "./telemetry.service";

@Controller("sites/:siteId/telemetry")
export class TelemetryController {
  // Explicit @Inject: `tsx` (esbuild) does not emit decorator metadata, so
  // constructor type-based injection would leave `telemetry` undefined in dev.
  constructor(@Inject(TelemetryService) private readonly telemetry: TelemetryService) {}

  @Get("latest")
  latest(
    @Param("siteId") siteId: string,
    @Query("limit", new ParseIntPipe({ optional: true })) limit?: number,
  ) {
    return this.telemetry.latest(siteId, limit ?? 60);
  }
}
