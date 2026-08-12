import type { AlpacaEnv } from "./alpaca";

export interface AlpacaClock {
  timestamp?: string;
  is_open?: boolean;
  next_open?: string;
  next_close?: string;
}

function authHeaders(env: AlpacaEnv): HeadersInit {
  if (!env.ALPACA_API_KEY_ID?.trim() || !env.ALPACA_API_SECRET_KEY?.trim()) {
    throw new Error("Alpaca credentials are required for market checks");
  }
  return {
    "APCA-API-KEY-ID": env.ALPACA_API_KEY_ID,
    "APCA-API-SECRET-KEY": env.ALPACA_API_SECRET_KEY,
    "Accept": "application/json",
  };
}

export async function getUsMarketClock(env: AlpacaEnv): Promise<AlpacaClock> {
  const response = await fetch("https://paper-api.alpaca.markets/v2/clock", {
    headers: authHeaders(env),
  });
  if (!response.ok) {
    throw new Error(`Alpaca market clock failed with HTTP ${response.status}`);
  }
  const payload = await response.json() as AlpacaClock;
  if (typeof payload.is_open !== "boolean") {
    throw new Error("Alpaca market clock response did not contain is_open");
  }
  return payload;
}

function minutesUntil(iso: string | undefined, from = Date.now()): number | null {
  if (!iso) return null;
  const target = new Date(iso).getTime();
  if (!Number.isFinite(target)) return null;
  return (target - from) / 60_000;
}

export function paperEntryGate(clock: AlpacaClock, nowMs = Date.now()): {
  allowed: boolean;
  reason: string | null;
} {
  if (!clock.is_open) {
    return { allowed: false, reason: "US market is closed according to Alpaca market clock" };
  }

  const minutesToClose = minutesUntil(clock.next_close, nowMs);
  if (minutesToClose !== null && minutesToClose <= 30) {
    return { allowed: false, reason: "30 minutes or less remain before the regular market close" };
  }

  return { allowed: true, reason: null };
}
