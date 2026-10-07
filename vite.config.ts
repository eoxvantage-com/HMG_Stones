import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import type { Plugin } from "vite";
import fs from "node:fs";
import path from "node:path";
// Serves authenticated commands, bounded catalogues, and private image tickets.
import { createWorkflowMiddleware } from './server/hmg/gateway.mjs';
import { redactSensitive } from './src/utils/redaction';
import { privateSafePublicAssets } from './scripts/hmg/private-safe-public-assets';

const CLIENT_LOG_ENDPOINT = "/__client_log";
const CLIENT_LOG_FILE = path.resolve(process.cwd(), "logs/frontend.ndjson");
const MAX_BODY_BYTES = 2 * 1024 * 1024;

const createClientLogPlugin = (): Plugin => ({
  name: "taruvi:client-log",
  apply: "serve",
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      const reqPath = req.url?.split("?")[0];
      if (reqPath !== CLIENT_LOG_ENDPOINT) {
        next();
        return;
      }

      if (req.method !== "POST") {
        res.statusCode = 405;
        res.setHeader("Allow", "POST");
        res.end("Method Not Allowed");
        return;
      }

      const chunks: Buffer[] = [];
      let totalBytes = 0;
      let aborted = false;

      req.on("data", (chunk: Buffer) => {
        if (aborted) return;
        totalBytes += chunk.length;
        if (totalBytes > MAX_BODY_BYTES) {
          aborted = true;
          res.statusCode = 413;
          res.end("Payload Too Large");
          req.destroy();
          return;
        }
        chunks.push(chunk);
      });

      req.on("error", () => {
        if (aborted) return;
        aborted = true;
        try {
          res.statusCode = 400;
          res.end("Request Error");
        } catch {
          /* noop */
        }
      });

      req.on("end", () => {
        if (aborted) return;
        try {
          const body = Buffer.concat(chunks).toString("utf8");
          if (!body.trim()) {
            res.statusCode = 204;
            res.end();
            return;
          }

          let parsed: unknown;
          try {
            parsed = JSON.parse(body);
          } catch {
            res.statusCode = 400;
            res.end("Invalid JSON");
            return;
          }

          const records = Array.isArray(parsed) ? parsed : [parsed];
          const receivedAt = new Date().toISOString();

          const lines = records
            .filter((record): record is Record<string, unknown> => !!record && typeof record === "object")
            .map((record) => {
              const safe = redactSensitive(record) as Record<string, unknown>;
              return JSON.stringify({ ...safe, server_received_at: receivedAt });
            })
            .join("\n");

          if (lines) {
            try {
              fs.mkdirSync(path.dirname(CLIENT_LOG_FILE), { recursive: true });
              fs.appendFileSync(CLIENT_LOG_FILE, `${lines}\n`, "utf8");
            } catch (writeErr) {
              server.config.logger.warn(
                `[taruvi:client-log] failed to write log: ${(writeErr as Error).message}`,
              );
            }
          }

          res.statusCode = 204;
          res.end();
        } catch (err) {
          server.config.logger.warn(
            `[taruvi:client-log] handler error: ${(err as Error).message}`,
          );
          try {
            res.statusCode = 500;
            res.end("Log handler error");
          } catch {
            /* noop */
          }
        }
      });
    });
  },
});

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    // Only explicitly defined public constants may reach browser code.
    envPrefix: [],
    define: {
      'import.meta.env.VITE_ENABLE_CLIENT_LOGGER': JSON.stringify(env.VITE_ENABLE_CLIENT_LOGGER === 'true' ? 'true' : 'false'),
      __TARUVI_SITE_URL__: JSON.stringify(env.TARUVI_SITE_URL ?? ""),
      __TARUVI_APP_SLUG__: JSON.stringify(env.TARUVI_APP_SLUG ?? ""),
      __TARUVI_APP_TITLE__: JSON.stringify(env.TARUVI_APP_TITLE ?? ""),
    },
    plugins: [react(), privateSafePublicAssets(), createClientLogPlugin(), {
      name: 'hmg:workflow-gateway',
      configureServer(server) {
        server.middlewares.use(createWorkflowMiddleware({
          siteUrl: env.TARUVI_SITE_URL, appSlug: env.TARUVI_APP_SLUG,
          apiKey: env['TARUVI_API_KEY'], allowedOrigin: env.HMG_ALLOWED_ORIGIN,
          development: true,
        }));
      },
    }],
    optimizeDeps: {
      include: [
        "@emotion/react",
        "@emotion/styled",
        "hoist-non-react-statics",
        "prop-types",
        "react-is"
      ],
      esbuildOptions: {
        target: "esnext"
      }
    },
    build: {
      commonjsOptions: {
        include: [/node_modules/],
        transformMixedEsModules: true
      }
    }
  };
});
