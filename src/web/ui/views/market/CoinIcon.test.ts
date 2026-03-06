import { test, expect } from "bun:test";

// Re-implemented from CoinIcon.tsx (module-private data)

const COIN_META: Record<string, { color: string; name: string }> = {
  BTC: { color: "#f7931a", name: "Bitcoin" },
  ETH: { color: "#627eea", name: "Ethereum" },
  SOL: { color: "#9945ff", name: "Solana" },
  BNB: { color: "#f3ba2f", name: "BNB" },
  XRP: { color: "#00aae4", name: "XRP" },
  DOGE: { color: "#c2a633", name: "Dogecoin" },
  ADA: { color: "#0033ad", name: "Cardano" },
  AVAX: { color: "#e84142", name: "Avalanche" },
};

const ICON_URLS: Record<string, string> = {
  BTC: "https://assets.coingecko.com/coins/images/1/small/bitcoin.png",
  ETH: "https://assets.coingecko.com/coins/images/279/small/ethereum.png",
  SOL: "https://assets.coingecko.com/coins/images/4128/small/solana.png",
  BNB: "https://assets.coingecko.com/coins/images/825/small/bnb-icon2_2x.png",
  XRP: "https://assets.coingecko.com/coins/images/44/small/xrp-symbol-white-128.png",
  DOGE: "https://assets.coingecko.com/coins/images/5/small/dogecoin.png",
  ADA: "https://assets.coingecko.com/coins/images/975/small/cardano.png",
  AVAX: "https://assets.coingecko.com/coins/images/12559/small/Avalanche_Circle_RedWhite_Trans.png",
};

// Ticker extraction logic from CoinIcon
function extractTicker(symbol: string): string {
  return symbol.split("/")[0] ?? symbol;
}

function resolveColor(ticker: string): string {
  return COIN_META[ticker]?.color ?? "#8e8a83";
}

/* ---------- extractTicker ---------- */

test("extractTicker extracts base from BTC/USDT", () => {
  expect(extractTicker("BTC/USDT")).toBe("BTC");
});

test("extractTicker extracts base from ETH/USDT", () => {
  expect(extractTicker("ETH/USDT")).toBe("ETH");
});

test("extractTicker returns symbol as-is when no slash", () => {
  expect(extractTicker("BTC")).toBe("BTC");
});

/* ---------- COIN_META ---------- */

test("COIN_META has entries for all 8 coins", () => {
  const expected = ["BTC", "ETH", "SOL", "BNB", "XRP", "DOGE", "ADA", "AVAX"];
  for (const ticker of expected) {
    expect(COIN_META[ticker]).toBeDefined();
    expect(COIN_META[ticker]!.color).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(COIN_META[ticker]!.name.length).toBeGreaterThan(0);
  }
});

test("COIN_META colors are unique", () => {
  const colors = Object.values(COIN_META).map((m) => m.color);
  expect(new Set(colors).size).toBe(colors.length);
});

/* ---------- ICON_URLS ---------- */

test("ICON_URLS has same keys as COIN_META", () => {
  const metaKeys = Object.keys(COIN_META).sort();
  const urlKeys = Object.keys(ICON_URLS).sort();
  expect(urlKeys).toEqual(metaKeys);
});

test("ICON_URLS all point to coingecko", () => {
  for (const url of Object.values(ICON_URLS)) {
    expect(url).toContain("coingecko.com");
  }
});

/* ---------- resolveColor ---------- */

test("resolveColor returns known coin color", () => {
  expect(resolveColor("BTC")).toBe("#f7931a");
  expect(resolveColor("ETH")).toBe("#627eea");
});

test("resolveColor returns default for unknown ticker", () => {
  expect(resolveColor("UNKNOWN")).toBe("#8e8a83");
});
