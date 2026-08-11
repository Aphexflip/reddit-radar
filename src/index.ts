import { alpacaPredict, type AlpacaPredictInput } from "./alpaca";
import { runAutonomousPaperCycle, type PaperCycleInput } from "./cycle";
import { dashboardHtml } from "./dashboard";
import {
  generatePrediction,
  ingestEvent,
  listOpportunities,
  recordOutcome,
  type GeneratePredictionInput,
  type IngestEventInput,
  type RecordOutcomeInput,
} from "./engine";
import {
  expandImpactGraph,
  upsertRelationship,
  type ExpandGraphInput,
  type UpsertRelationshipInput,
} from "./graph";
import { collectDueOutcomes } from "./outcomes";
import { executeTieredPaperPrediction } from "./paper";
import { paperPortfolio } from "./portfolio";
import { proofSummary } from "./proof";
import { syncPulseTrends, type PulseSyncInput } from "./pulse";
import { runScheduledPaperTick } from "./scheduler";
import { pollSecSubmissions, type SecPollInput } from "./sec";
import { paperSessionStatus } from "./session";
import { runSystemTestTrade, type SystemTestInput } from "./system-test";

type RuntimeEnv = Env & {
  WRITE_TOKEN?: string;
  SEC_USER_AGENT?: string;
  ALPACA_API_KEY_ID?: string;
  ALPACA_API_SECRET_KEY?: string;
  ALPACA_STOCK_FEED?: string;
  ALPACA_OPTION_FEED?: string;
  PULSE_API_ORIGIN?: string;
  PULSE_API_TOKEN?: string;
};

interface CloudflareSubtleCrypto extends SubtleCrypto {
  timingSafeEqual(a: ArrayBuffer | ArrayBufferView, b: ArrayBuffer | ArrayBufferView): boolean;
}

function json(data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

async function readJson<T>(request: Request): Promise<T> {
  const length = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(length) && length > 2_000_000) {
    throw new Error("request body exceeds 2 MB limit");
  }
  return await request.json() as T;
}

async function timingSafeTokenMatch(provided: string, expected: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [providedHash, expectedHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(provided)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ]);
  const subtle = crypto.subtle as CloudflareSubtleCrypto;
  return subtle.timingSafeEqual(providedHash, expectedHash);
}

async function authorizeWrite(request: Request, env: RuntimeEnv): Promise<Response | null> {
  if (!env.WRITE_TOKEN) {
    return json({ error: "WRITE_TOKEN secret is not configured; write endpoints are fail-closed" }, 503);
  }
  const header = request.headers.get("Authorization") ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice(7) : "";
  const allowed = await timingSafeTokenMatch(provided, env.WRITE_TOKEN);
  return allowed ? null : json({ error: "unauthorized" }, 401);
}

function isWriteMethod(method: string): boolean {
  return method !== "GET" && method !== "HEAD" && method !== "OPTIONS";
}

export default {
  async fetch(request: Request, env: RuntimeEnv): Promise<Response> {
    const url = new URL(request.url);

    try {
      if (url.pathname === "/" && request.method === "GET") {
        return new Response(dashboardHtml(), {
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
            "Content-Security-Policy": "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'",
          },
        });
      }

      if (url.pathname === "/api/health" && request.method === "GET") {
        const dbCheck = await env.DB.prepare("SELECT 1 AS ok").first<{ ok: number }>();
        return json({
          ok: dbCheck?.ok === 1,
          system_version: env.SYSTEM_VERSION,
          execution_mode: env.EXECUTION_MODE,
          live_trading_enabled: false,
          sec_configured: Boolean(env.SEC_USER_AGENT?.trim()),
          pulse_origin: env.PULSE_API_ORIGIN?.trim() || "https://redditpulse-v0.aphexflip.workers.dev",
          alpaca_configured: Boolean(env.ALPACA_API_KEY_ID?.trim() && env.ALPACA_API_SECRET_KEY?.trim()),
          alpaca_stock_feed: env.ALPACA_STOCK_FEED?.trim() || "iex",
          alpaca_option_feed: env.ALPACA_OPTION_FEED?.trim() || "indicative",
          autonomous_paper_cycle_ready: Boolean(
            env.EXECUTION_MODE === "paper" &&
            env.ALPACA_API_KEY_ID?.trim() &&
            env.ALPACA_API_SECRET_KEY?.trim()
          ),
          timestamp: new Date().toISOString(),
        });
      }

      if (url.pathname === "/api/session/status" && request.method === "GET") {
        return json(await paperSessionStatus(env));
      }

      if (url.pathname === "/api/opportunities" && request.method === "GET") {
        const limit = Number(url.searchParams.get("limit") ?? "25");
        return json(await listOpportunities(env, Number.isFinite(limit) ? limit : 25));
      }

      if (url.pathname === "/api/proof" && request.method === "GET") {
        return json(await proofSummary(env));
      }

      if (url.pathname === "/api/paper/portfolio" && request.method === "GET") {
        return json(await paperPortfolio(env));
      }

      if (isWriteMethod(request.method) && url.pathname.startsWith("/api/")) {
        const denied = await authorizeWrite(request, env);
        if (denied) return denied;
      }

      if (url.pathname === "/api/events" && request.method === "POST") {
        const input = await readJson<IngestEventInput>(request);
        return json(await ingestEvent(env, input), 201);
      }

      if (url.pathname === "/api/pulse/sync" && request.method === "POST") {
        const input = await readJson<PulseSyncInput>(request);
        return json(await syncPulseTrends(env, input));
      }

      if (url.pathname === "/api/sec/poll" && request.method === "POST") {
        const input = await readJson<SecPollInput>(request);
        return json(await pollSecSubmissions(env, input));
      }

      if (url.pathname === "/api/graph/relationship" && request.method === "POST") {
        const input = await readJson<UpsertRelationshipInput>(request);
        return json(await upsertRelationship(env, input), 201);
      }

      if (url.pathname === "/api/graph/expand" && request.method === "POST") {
        const input = await readJson<ExpandGraphInput>(request);
        return json(await expandImpactGraph(env, input));
      }

      if (url.pathname === "/api/alpaca/predict" && request.method === "POST") {
        const input = await readJson<AlpacaPredictInput>(request);
        return json(await alpacaPredict(env, input), 201);
      }

      if (url.pathname === "/api/run/paper-cycle" && request.method === "POST") {
        const input = await readJson<PaperCycleInput>(request);
        return json(await runAutonomousPaperCycle(env, input), 201);
      }

      if (url.pathname === "/api/predictions" && request.method === "POST") {
        const input = await readJson<GeneratePredictionInput>(request);
        return json(await generatePrediction(env, input), 201);
      }

      if (url.pathname === "/api/paper/system-test" && request.method === "POST") {
        const input = await readJson<SystemTestInput>(request);
        return json(await runSystemTestTrade(env, input), 201);
      }

      const paperMatch = url.pathname.match(/^\/api\/paper\/execute\/([^/]+)$/);
      if (paperMatch && request.method === "POST") {
        const predictionId = decodeURIComponent(paperMatch[1] ?? "");
        if (!predictionId) return json({ error: "prediction id is required" }, 400);
        return json(await executeTieredPaperPrediction(env, predictionId));
      }

      if (url.pathname === "/api/outcomes/collect" && request.method === "POST") {
        const input = await readJson<{ limit?: number }>(request);
        const limit = Number.isFinite(input.limit) ? Number(input.limit) : 20;
        return json(await collectDueOutcomes(env, limit));
      }

      if (url.pathname === "/api/outcomes" && request.method === "POST") {
        const input = await readJson<RecordOutcomeInput>(request);
        return json(await recordOutcome(env, input), 201);
      }

      return json({ error: "not found" }, 404);
    } catch (error) {
      console.error(JSON.stringify({
        level: "error",
        event: "request_failed",
        method: request.method,
        path: url.pathname,
        message: error instanceof Error ? error.message : String(error),
      }));
      return json({
        error: "request failed",
        detail: error instanceof Error ? error.message : "unknown error",
      }, 400);
    }
  },

  async scheduled(_controller: ScheduledController, env: RuntimeEnv, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      runScheduledPaperTick(env)
        .then((summary) => {
          console.log(JSON.stringify({
            level: summary.errors.length ? "warn" : "info",
            event: "scheduled_paper_tick",
            ...summary,
          }));
        })
        .catch((error) => {
          console.error(JSON.stringify({
            level: "error",
            event: "scheduled_paper_tick_failed",
            message: error instanceof Error ? error.message : String(error),
          }));
        }),
    );
  },
} satisfies ExportedHandler<RuntimeEnv>;
