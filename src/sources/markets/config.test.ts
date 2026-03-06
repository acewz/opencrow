import { test, expect, describe } from "bun:test";
import { getListingDate, LISTING_DATES, FUNDING_EARLIEST, METRICS_EARLIEST } from "./config";

describe("getListingDate", () => {
  test("returns correct BTC spot listing date", () => {
    const date = getListingDate("BTC/USDT", "spot");
    expect(date.toISOString()).toBe("2017-08-17T00:00:00.000Z");
  });

  test("returns correct BTC futures listing date", () => {
    const date = getListingDate("BTC/USDT", "futures");
    expect(date.toISOString()).toBe("2019-09-08T00:00:00.000Z");
  });

  test("returns correct ETH spot listing date", () => {
    const date = getListingDate("ETH/USDT", "spot");
    expect(date.toISOString()).toBe("2017-08-17T00:00:00.000Z");
  });

  test("returns correct SOL futures listing date", () => {
    const date = getListingDate("SOL/USDT", "futures");
    expect(date.toISOString()).toBe("2020-10-09T00:00:00.000Z");
  });

  test("returns fallback date for unknown symbol", () => {
    const date = getListingDate("DOGE/USDT", "spot");
    expect(date.toISOString()).toBe("2017-08-17T00:00:00.000Z");
  });

  test("returns fallback date for unknown market type", () => {
    const date = getListingDate("BTC/USDT", "margin");
    expect(date.toISOString()).toBe("2017-08-17T00:00:00.000Z");
  });
});

describe("LISTING_DATES", () => {
  test("contains all supported symbols", () => {
    expect(LISTING_DATES["BTC/USDT"]).toBeDefined();
    expect(LISTING_DATES["ETH/USDT"]).toBeDefined();
    expect(LISTING_DATES["SOL/USDT"]).toBeDefined();
  });

  test("each symbol has spot and futures", () => {
    for (const symbol of Object.keys(LISTING_DATES)) {
      expect(LISTING_DATES[symbol]!["spot"]).toBeDefined();
      expect(LISTING_DATES[symbol]!["futures"]).toBeDefined();
    }
  });
});

describe("FUNDING_EARLIEST", () => {
  test("has entries for all symbols", () => {
    expect(FUNDING_EARLIEST["BTC/USDT"]).toBeDefined();
    expect(FUNDING_EARLIEST["ETH/USDT"]).toBeDefined();
    expect(FUNDING_EARLIEST["SOL/USDT"]).toBeDefined();
  });
});

describe("METRICS_EARLIEST", () => {
  test("is a valid date string", () => {
    const d = new Date(METRICS_EARLIEST);
    expect(d.getFullYear()).toBe(2021);
  });
});
