import { Controller, Get, Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
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
  controllers: [HealthController, TelemetryController],
  providers: [TelemetryService],
})
class AppModule {}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  app.setGlobalPrefix("api");
  await app.listen(Number(process.env.API_PORT ?? 4000));
}

void bootstrap();
