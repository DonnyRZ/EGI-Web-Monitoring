import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module";
import { assertProductionRuntimeConfig, shouldEnableSwagger } from "./common/runtime-config";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  assertProductionRuntimeConfig();

  const apiPrefix = process.env.API_PREFIX ?? "api";
  app.setGlobalPrefix(apiPrefix);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  const corsOrigins = (process.env.CORS_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  app.enableCors({
    // Local development keeps its existing permissive behavior; production is
    // validated above and only admits explicitly configured frontends.
    origin: process.env.NODE_ENV === "production" ? corsOrigins : true,
    credentials: true,
  });

  const swaggerConfig = new DocumentBuilder()
    .setTitle("EGI Website Monitoring API")
    .setDescription(
      "OpenAPI for EGI Website Monitoring MVP. Source of truth: Docs schema + data-pipeline blueprint + swagger_output.json.",
    )
    .setVersion("1.0.0-mvp")
    .addBearerAuth()
    .build();

  if (shouldEnableSwagger()) {
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup("docs", app, document, {
      jsonDocumentUrl: "docs/json",
    });
  }

  const port = Number(process.env.BACKEND_PORT ?? 3001);
  await app.listen(port);

  console.log(`API listening on http://localhost:${port}/${apiPrefix}`);
  console.log(`Swagger UI on http://localhost:${port}/docs`);
}

bootstrap();
