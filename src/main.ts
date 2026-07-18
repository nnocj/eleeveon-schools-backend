import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { json, urlencoded } from "express";

import { AppModule } from "./app.module";

/**
 * Eleeveon Schools backend bootstrap.
 *
 * Sync payload policy:
 * - Normal frontend sync batches should remain well below 1 MB.
 * - The backend accepts up to 2 MB so safe batches are not rejected.
 * - Oversized individual records must still be rejected by SyncService.
 * - Media blobs/files must use the dedicated media upload pipeline instead of
 *   normal JSON SyncRecord payloads.
 */
async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  /**
   * Moderate request-body ceiling.
   *
   * This fixes ordinary "request entity too large" errors without allowing
   * extremely large JSON bodies that could consume excessive server memory.
   */
  app.use(
    json({
      limit: "2mb",
    }),
  );

  app.use(
    urlencoded({
      extended: true,
      limit: "2mb",
    }),
  );

  /**
   * Development-compatible CORS.
   *
   * `origin: true` reflects the requesting origin. This is suitable for your
   * current localhost and deployed frontend setup when credentials are used.
   * Later, production can be restricted to an explicit allowlist.
   */
  app.enableCors({
    origin: true,
    credentials: true,
    methods: [
      "GET",
      "POST",
      "PUT",
      "PATCH",
      "DELETE",
      "OPTIONS",
    ],
    allowedHeaders: [
      "Accept",
      "Authorization",
      "Content-Type",
      "X-Device-Id",
    ],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );

  const port = Number(process.env.PORT || 4000);

  await app.listen(port);

  console.log(
    `Eleeveon backend running on http://localhost:${port}`,
  );
}

void bootstrap();