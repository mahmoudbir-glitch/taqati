import "./env";
import { Controller, Get, Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { SmartessController } from "./smartess/smartess.controller";
import { SmartessPoller } from "./smartess/smartess.poller";
import { TelemetryController } from "./telemetry.controller";
import { TelemetryService } from "./telemetry.service";

@Controller()
class HealthController {
  @Get("/health")
  health() {
    return {
      service: "taqati-api",
      status: "ok",
      timestamp: new Date().toISOString(),
    };
  }
}

@Module({
  controllers: [HealthController, TelemetryController, SmartessController],
  providers: [TelemetryService, SmartessPoller],
})
class AppModule {}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // WEB_ORIGIN is a comma-separated allow-list; without it any origin may read.
  const origins = (process.env.WEB_ORIGIN ?? "")
    .split(",")
    .map((origin) => origin.trim().replace(/\/$/, ""))
    .filter(Boolean);
  app.enableCors(origins.length > 0 ? { origin: origins } : undefined);
  app.setGlobalPrefix("api");
  // Lets onModuleDestroy close MQTT and the database on SIGTERM/SIGINT.
  app.enableShutdownHooks();
  await app.listen(Number(process.env.API_PORT ?? process.env.PORT ?? 4000));
}

void bootstrap();
