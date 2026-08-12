import { afterEach, describe, expect, it, vi } from "vitest";
import {
  alpacaPaperCloseClientOrderId,
  alpacaPaperEntryClientOrderId,
  alpacaPaperOrderState,
  resolveBrokerMode,
  submitAlpacaPaperOptionBuy,
  submitAlpacaPaperOptionClose,
  type AlpacaPaperEnv,
} from "../src/broker-alpaca-paper";

function env(mode = "alpaca_paper"): AlpacaPaperEnv {
  return {
    EXECUTION_MODE: "paper",
    BROKER_MODE: mode,
    ALPACA_API_KEY_ID: "paper-key",
    ALPACA_API_SECRET_KEY: "paper-secret",
  } as unknown as AlpacaPaperEnv;
}

function brokerModeInput(mode?: string): Parameters<typeof resolveBrokerMode>[0] {
  // Wrangler narrows deployed BROKER_MODE to the exact configured literal. This
  // cast intentionally exercises resolveBrokerMode's runtime fail-closed guard
  // against absent/invalid configuration values that can still occur outside
  // generated production bindings.
  return (mode === undefined ? {} : { BROKER_MODE: mode }) as unknown as Parameters<typeof resolveBrokerMode>[0];
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("paper broker mode", () => {
  it("defaults deterministic tests to local_sim", () => {
    expect(resolveBrokerMode(brokerModeInput())).toBe("local_sim");
  });

  it("accepts alpaca_paper and rejects any other broker mode", () => {
    expect(resolveBrokerMode(brokerModeInput("alpaca_paper"))).toBe("alpaca_paper");
    expect(() => resolveBrokerMode(brokerModeInput("live"))).toThrow(/Unsupported BROKER_MODE/);
  });

  it("builds stable idempotency keys under Alpaca's 128 character limit", () => {
    const entry = alpacaPaperEntryClientOrderId("p".repeat(200));
    const close = alpacaPaperCloseClientOrderId("o".repeat(200), 2);
    expect(entry.length).toBeLessThanOrEqual(128);
    expect(close.length).toBeLessThanOrEqual(128);
    expect(entry.startsWith("radar-entry-")).toBe(true);
    expect(close.startsWith("radar-close-")).toBe(true);
  });

  it("classifies fills and terminal rejections conservatively", () => {
    expect(alpacaPaperOrderState("filled")).toBe("filled");
    expect(alpacaPaperOrderState("rejected")).toBe("rejected");
    expect(alpacaPaperOrderState("canceled")).toBe("rejected");
    expect(alpacaPaperOrderState("new")).toBe("pending");
    expect(alpacaPaperOrderState("partially_filled")).toBe("pending");
  });
});

describe("Alpaca PAPER order routing", () => {
  it("submits long-option entry as a limit buy only to paper-api.alpaca.markets", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("https://paper-api.alpaca.markets/v2/orders");
      expect(String(input)).not.toContain("https://api.alpaca.markets");
      const body = JSON.parse(String(init?.body));
      expect(body).toEqual({
        symbol: "SPY260918C00600000",
        qty: "1",
        side: "buy",
        type: "limit",
        time_in_force: "day",
        limit_price: "0.82",
        client_order_id: "radar-entry-test",
      });
      return new Response(JSON.stringify({
        id: "broker-order-1",
        client_order_id: body.client_order_id,
        symbol: body.symbol,
        status: "new",
        side: "buy",
        type: "limit",
        qty: "1",
        filled_qty: "0",
        limit_price: "0.82",
      }), { status: 200, headers: { "x-request-id": "req-1" } });
    });
    vi.stubGlobal("fetch", fetchMock);

    const order = await submitAlpacaPaperOptionBuy(env(), {
      symbol: "SPY260918C00600000",
      quantity: 1,
      limitPrice: 0.82,
      clientOrderId: "radar-entry-test",
    });

    expect(order.id).toBe("broker-order-1");
    expect(order.status).toBe("new");
    expect(order.request_id).toBe("req-1");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("submits the horizon exit as a market sell to the PAPER endpoint", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("https://paper-api.alpaca.markets/v2/orders");
      const body = JSON.parse(String(init?.body));
      expect(body.side).toBe("sell");
      expect(body.type).toBe("market");
      expect(body.time_in_force).toBe("day");
      return new Response(JSON.stringify({
        id: "broker-close-1",
        client_order_id: body.client_order_id,
        symbol: body.symbol,
        status: "accepted",
        side: "sell",
        type: "market",
        qty: "1",
        filled_qty: "0",
      }), { status: 200 });
    }));

    const order = await submitAlpacaPaperOptionClose(env(), {
      symbol: "SPY260918C00600000",
      quantity: 1,
      clientOrderId: "radar-close-test-1",
    });
    expect(order.status).toBe("accepted");
  });

  it("hard-fails the broker client outside EXECUTION_MODE=paper", async () => {
    const badEnv = {
      EXECUTION_MODE: "live",
      BROKER_MODE: "alpaca_paper",
      ALPACA_API_KEY_ID: "key",
      ALPACA_API_SECRET_KEY: "secret",
    } as unknown as AlpacaPaperEnv;

    await expect(submitAlpacaPaperOptionBuy(badEnv, {
      symbol: "SPY260918C00600000",
      quantity: 1,
      limitPrice: 0.82,
      clientOrderId: "radar-entry-test",
    })).rejects.toThrow(/hard-disabled unless EXECUTION_MODE=paper/);
  });
});
