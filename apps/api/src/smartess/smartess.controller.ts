import { Body, Controller, Delete, Get, Headers, HttpCode, Inject, Param, Post, Put } from "@nestjs/common";
import { assertAdmin } from "../admin-auth";
import { SmartessInput, SmartessPoller } from "./smartess.poller";

@Controller("sites/:siteId/smartess")
export class SmartessController {
  constructor(@Inject(SmartessPoller) private readonly smartess: SmartessPoller) {}

  /** Masked connection status; readable like the telemetry endpoints. */
  @Get()
  status(@Param("siteId") siteId: string) {
    return this.smartess.status(siteId);
  }

  @Put()
  save(@Param("siteId") siteId: string, @Headers("authorization") authorization: string | undefined, @Body() body: SmartessInput) {
    assertAdmin(authorization);
    return this.smartess.save(siteId, body ?? {});
  }

  @Post("test")
  @HttpCode(200)
  test(@Param("siteId") siteId: string, @Headers("authorization") authorization: string | undefined, @Body() body: SmartessInput) {
    assertAdmin(authorization);
    return this.smartess.test(siteId, body ?? {});
  }

  @Delete()
  remove(@Param("siteId") siteId: string, @Headers("authorization") authorization: string | undefined) {
    assertAdmin(authorization);
    return this.smartess.remove(siteId);
  }
}
