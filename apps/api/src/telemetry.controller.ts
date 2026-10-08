import { Controller, Get, Param, ParseIntPipe, Query } from "@nestjs/common";
import { TelemetryService } from "./telemetry.service";

@Controller("sites/:siteId/telemetry")
export class TelemetryController {
  constructor(private readonly telemetry: TelemetryService) {}

  @Get("latest")
  latest(
    @Param("siteId") siteId: string,
    @Query("limit", new ParseIntPipe({ optional: true })) limit?: number,
  ) {
    return this.telemetry.latest(siteId, limit ?? 60);
  }
}
