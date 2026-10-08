import { Controller, Get, Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";

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

@Module({ controllers: [HealthController] })
class AppModule {}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  await app.listen(Number(process.env.API_PORT ?? 4000));
}

void bootstrap();
