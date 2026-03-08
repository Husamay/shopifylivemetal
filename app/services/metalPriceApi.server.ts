/**
 * Metal Price API client (free tier).
 * https://metalpriceapi.com/documentation
 * Free: 100 requests/month, daily delay. Use EU endpoint for EUR.
 */

const EU_BASE = "https://api-eu.metalpriceapi.com/v1";

export type MetalCode = "XAU" | "XAG"; // gold, silver (per troy oz)

export interface RatesInEur {
  /** EUR per troy ounce of gold */
  XAU_per_troy_oz: number;
  /** EUR per troy ounce of silver */
  XAG_per_troy_oz: number;
  /** EUR per gram of gold (for shop metafields / product calc) */
  XAU_per_gram: number;
  /** EUR per gram of silver (for shop metafields / product calc) */
  XAG_per_gram: number;
  timestamp: number;
}

const GRAMS_PER_TROY_OZ = 31.1035;

/**
 * Fetch latest rates from Metal Price API.
 * Uses base=USD and currencies=EUR,XAU,XAG then derives EUR per metal.
 * One request per call; cache result for 24h to respect free tier (100/month).
 */
export async function fetchRatesInEur(apiKey: string): Promise<RatesInEur> {
  const url = `${EU_BASE}/latest?api_key=${encodeURIComponent(apiKey)}&base=USD&currencies=EUR,XAU,XAG`;
  const res = await fetch(url);

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Metal Price API error ${res.status}: ${text}`);
  }

  const data = (await res.json()) as {
    success: boolean;
    base: string;
    timestamp: number;
    rates: {
      EUR?: number;
      USDEUR?: number;
      USDXAU?: number;
      USDXAG?: number;
    };
  };

  if (!data.success || !data.rates) {
    throw new Error("Metal Price API returned invalid response");
  }

  // rates.USDXAU = USD per 1 troy oz gold, rates.EUR = USD per 1 EUR (1 USD = rates.EUR EUR)
  // So 1 troy oz XAU = USDXAU USD = (USDXAU / USDEUR) EUR where USDEUR = 1/rates.EUR
  const usdPerEur = data.rates.USDEUR ?? 1 / (data.rates.EUR ?? 1);
  const eurPerXau = (data.rates.USDXAU ?? 0) / usdPerEur;
  const eurPerXag = (data.rates.USDXAG ?? 0) / usdPerEur;

  const eurPerGramXau = eurPerXau / GRAMS_PER_TROY_OZ;
  const eurPerGramXag = eurPerXag / GRAMS_PER_TROY_OZ;

  return {
    XAU_per_troy_oz: eurPerXau,
    XAG_per_troy_oz: eurPerXag,
    XAU_per_gram: eurPerGramXau,
    XAG_per_gram: eurPerGramXag,
    timestamp: data.timestamp,
  };
}

/**
 * Compute price in EUR for a given metal and weight (grams).
 * price = (weight_grams / 31.1035) * rate_eur_per_troy_oz * (1 + markupPercent/100)
 */
export function computePriceEur(
  metal: MetalCode,
  weightGrams: number,
  rates: RatesInEur,
  markupPercent: number
): number {
  const troyOz = weightGrams / GRAMS_PER_TROY_OZ;
  const rate = metal === "XAU" ? rates.XAU_per_troy_oz : rates.XAG_per_troy_oz;
  const withMarkup = rate * (1 + markupPercent / 100);
  return Math.round(troyOz * withMarkup * 100) / 100;
}
