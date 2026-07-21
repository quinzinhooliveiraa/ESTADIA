import path from "path";
import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

// Replit (and most PaaS) terminate TLS at a reverse proxy; trust one hop
// so express-rate-limit can read the real client IP from X-Forwarded-For.
app.set("trust proxy", 1);

// A5: security headers
app.use(helmet());

// A5: restrict CORS to APP_ORIGIN in production; open in dev
const allowedOrigins = process.env.APP_ORIGIN?.split(",").map((o) => o.trim());
app.use(
  cors({
    origin: allowedOrigins && allowedOrigins.length > 0 ? allowedOrigins : true,
    credentials: true,
  })
);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  })
);

// A4: photo route gets 8 MB; everything else gets the default 100 KB.
// Capture raw body for webhook HMAC-SHA256 signature verification.
// NOTE: the `verify` callback runs unconditionally for every request (no path
// filter), so rawBody is available for both /api/webhooks/abacatepay and the
// alias /webhooks/abacatepay mounted below.
app.use((req, res, next) => {
  const isFotosRoute =
    req.method === "POST" &&
    /^\/api\/esperas\/[^/]+\/fotos$/.test(req.path);
  express.json({
    limit: isFotosRoute ? "8mb" : "100kb",
    verify: (req: any, _res, buf, encoding) => {
      req.rawBody = buf.toString((encoding as BufferEncoding) || "utf8");
    },
  })(req, res, next);
});
app.use(express.urlencoded({ extended: true }));

// Primary API mount (all routes under /api).
app.use("/api", router);

// Alias mount so that /webhooks/abacatepay (without the /api prefix) reaches
// the same handler that is registered at /api/webhooks/abacatepay inside the
// router. This lets the AbacatePay dashboard webhook URL stay without /api.
// All other routes in the router that match here are harmless (they require
// auth and will return 401 for unauthenticated callers).
app.use(router);

// ── Production: serve frontend static files + SPA fallback ────────────────
if (process.env.NODE_ENV === "production") {
  // Default path: <repo-root>/artifacts/estadia/dist/public
  // __dirname is set by the esbuild banner to the bundle's directory
  // (artifacts/api-server/dist), so two levels up lands at the repo root.
  const staticDir =
    process.env.STATIC_DIR ??
    path.resolve(__dirname, "..", "..", "estadia", "dist", "public");

  app.use(express.static(staticDir));

  // SPA fallback — serve index.html for any route that isn't /api or /webhooks
  app.get(/.*/, (req, res, next) => {
    if (req.path.startsWith("/api") || req.path.startsWith("/webhooks")) {
      return next();
    }
    res.sendFile(path.join(staticDir, "index.html"));
  });
}

export default app;
