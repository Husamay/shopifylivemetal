import { describe, it, expect } from "vitest";
import {
  parseWeightGram,
  computeProductPriceEur,
} from "./updatePrices.server";

describe("parseWeightGram", () => {
  it("treats null and undefined as 0", () => {
    expect(parseWeightGram(null)).toBe(0);
    expect(parseWeightGram(undefined)).toBe(0);
  });

  it("treats empty and whitespace-only strings as 0", () => {
    expect(parseWeightGram("")).toBe(0);
    expect(parseWeightGram("   ")).toBe(0);
    expect(parseWeightGram("\t\n")).toBe(0);
  });

  it("parses valid numbers and trims", () => {
    expect(parseWeightGram("0")).toBe(0);
    expect(parseWeightGram("1.5")).toBe(1.5);
    expect(parseWeightGram("  2  ")).toBe(2);
    expect(parseWeightGram("10")).toBe(10);
  });

  it("returns NaN for non-numeric strings", () => {
    expect(Number.isNaN(parseWeightGram("abc"))).toBe(true);
    expect(Number.isNaN(parseWeightGram("n/a"))).toBe(true);
  });
});

describe("computeProductPriceEur", () => {
  const silverPrice = 0.8;
  const goldPrice = 60;
  const margin = 15;

  it("computes silver-only price (gold weight 0)", () => {
    const price = computeProductPriceEur(
      silverPrice,
      goldPrice,
      10,
      0,
      margin
    );
    // 0.8 * 10 * 1.15 = 9.2
    expect(price).toBe(9.2);
  });

  it("computes gold-only price (silver weight 0)", () => {
    const price = computeProductPriceEur(
      silverPrice,
      goldPrice,
      0,
      1,
      margin
    );
    // 60 * 1 * 1.15 = 69
    expect(price).toBe(69);
  });

  it("computes both metals", () => {
    const price = computeProductPriceEur(
      silverPrice,
      goldPrice,
      10,
      1,
      margin
    );
    // (0.8*10 + 60*1) * 1.15 = 68 * 1.15 = 78.2
    expect(price).toBe(78.2);
  });

  it("rounds to two decimal places", () => {
    const price = computeProductPriceEur(
      0.33,
      50,
      1,
      1,
      10
    );
    expect(Number.isInteger(price * 100)).toBe(true);
  });
});
