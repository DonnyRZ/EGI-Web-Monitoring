import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { createLogger } from "@egi/logging";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module";
import { assertProductionRuntimeConfig, shouldEnableSwagger } from "./common/runtime-config";
import { requestLoggingMiddleware } from "./common/request-logging.middleware";

async function bootstrap() {
  const logger = createLogger("backend");
  const app = await NestFactory.create(AppModule, { logger });
  app.use(requestLoggingMiddleware(logger));
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

  logger.log("service_ready", undefined, {
    port,
    api_prefix: apiPrefix,
    swagger_enabled: shouldEnableSwagger(),
  });
}

bootstrap().catch((error) => {
  createLogger("backend").error(error, error instanceof Error ? error.stack : undefined, "bootstrap");
  process.exitCode = 1;
});
