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
  const app = await NestFactory.create(AppModule, { bodyParser: false });

  /**
   * Moderate request-body ceiling.
   *
   * This fixes ordinary "request entity too large" errors without allowing
   * extremely large JSON bodies that could consume excessive server memory.
   */
  app.use(
    json({
      limit: "2mb",
      verify: (req, _res, buf) => { (req as any).rawBody = Buffer.from(buf); },
    }),
  );

  app.use(
    urlencoded({
      extended: true,
      limit: "2mb",
      verify: (req, _res, buf) => { (req as any).rawBody = Buffer.from(buf); },
    }),
  );

  // Required for credentialed refresh cookies: never reflect arbitrary origins.
  // Example: ELEEVEON_ALLOWED_FRONTEND_ORIGINS=https://schools.eleeveon.com,http://localhost:3000
  const trustedOrigins = new Set(
    (process.env.ELEEVEON_ALLOWED_FRONTEND_ORIGINS || "")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
  );
  if (trustedOrigins.size === 0) {
    throw new Error("ELEEVEON_ALLOWED_FRONTEND_ORIGINS must be configured before the API starts");
  }
  app.enableCors({
    origin: (origin, callback) => {
      // Non-browser clients have no Origin header; JWT guards still protect APIs.
      if (!origin || trustedOrigins.has(origin)) return callback(null, true);
      return callback(new Error("CORS origin not permitted"), false);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Accept", "Authorization", "Content-Type", "X-Device-Id"],
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