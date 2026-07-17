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

// A4: photo route gets 8 MB; everything else gets the default 100 KB
app.use((req, res, next) => {
  const isFotosRoute =
    req.method === "POST" &&
    /^\/api\/esperas\/[^/]+\/fotos$/.test(req.path);
  express.json({ limit: isFotosRoute ? "8mb" : "100kb" })(req, res, next);
});
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

export default app;
