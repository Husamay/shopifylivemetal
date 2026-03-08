import type { AdminApiContext } from "@shopify/shopify-app-remix/server";
import { fetchRatesInEur } from "./metalPriceApi.server";

const NAMESPACE = "custom";
const SHOP_SILVER_KEY = "silver_price_per_gram";
const SHOP_GOLD_KEY = "gold_price_per_gram";
const MARGIN_PERCENTAGE_KEY = "margin_percentage";
const SILVER_WEIGHT_KEY = "silver_weight_gram";
const GOLD_WEIGHT_KEY = "gold_weight_gram";

const DEBUG = process.env.DEBUG_METAL_PRICES === "1" || process.env.DEBUG_METAL_PRICES === "true";

/**
 * Parse weight metafield value: trim, treat null/empty/whitespace as 0.
 * Returns 0 for blank, or parseFloat result (may be NaN for invalid input).
 */
export function parseWeightGram(value: string | null | undefined): number {
  const s = typeof value === "string" ? value.trim() : "";
  if (s === "") return 0;
  return parseFloat(s);
}

/**
 * Get shop GID and write silver/gold price per gram to shop metafields.
 */
async function writeShopMetalPrices(
  admin: AdminApiContext,
  silverPricePerGram: number,
  goldPricePerGram: number
): Promise<void> {
  const shopQuery = `
    query {
      shop { id }
    }
  `;
  const shopRes = await admin.graphql(shopQuery);
  const shopJson = (await shopRes.json()) as { data?: { shop?: { id: string } } };
  const shopId = shopJson.data?.shop?.id;
  if (!shopId) throw new Error("Could not get shop id");

  const mutation = `
    mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields { id key namespace value }
        userErrors { field message }
      }
    }
  `;
  const metafields = [
    {
      ownerId: shopId,
      namespace: NAMESPACE,
      key: SHOP_SILVER_KEY,
      type: "number_decimal",
      value: String(silverPricePerGram),
    },
    {
      ownerId: shopId,
      namespace: NAMESPACE,
      key: SHOP_GOLD_KEY,
      type: "number_decimal",
      value: String(goldPricePerGram),
    },
  ];
  const mutRes = await admin.graphql(mutation, { variables: { metafields } });
  const mutJson = (await mutRes.json()) as {
    data?: { metafieldsSet?: { userErrors: Array<{ message: string }> } };
  };
  const errs = mutJson.data?.metafieldsSet?.userErrors ?? [];
  if (errs.length > 0) throw new Error(errs.map((e) => e.message).join("; "));
}

/**
 * Compute product price in EUR:
 * - Silver only: silver_price_per_gram × silver_weight_gram × (1 + margin/100)
 * - Gold only: gold_price_per_gram × gold_weight_gram × (1 + margin/100)
 * - Both: (silver_price × silver_weight + gold_price × gold_weight) × (1 + margin/100)
 */
export function computeProductPriceEur(
  silverPricePerGram: number,
  goldPricePerGram: number,
  silverWeightGram: number,
  goldWeightGram: number,
  marginPercent: number
): number {
  const cost =
    silverPricePerGram * silverWeightGram + goldPricePerGram * goldWeightGram;
  const withMargin = cost * (1 + marginPercent / 100);
  return Math.round(withMargin * 100) / 100;
}

/**
 * Fetch rates, write shop metafields (silver_price_per_gram, gold_price_per_gram),
 * then update all products that have custom.margin_percentage and at least one of
 * custom.silver_weight_gram / custom.gold_weight_gram. Uses default markup when
 * product has no margin_percentage.
 */
export async function updateMetalPrices(
  admin: AdminApiContext,
  apiKey: string,
  defaultMarkupPercent: number
): Promise<{ updated: number; errors: string[]; skipped: Array<{ productId: string; reason: string }> }> {
  const rates = await fetchRatesInEur(apiKey);
  const silverPricePerGram = rates.XAG_per_gram;
  const goldPricePerGram = rates.XAU_per_gram;

  try {
    await writeShopMetalPrices(admin, silverPricePerGram, goldPricePerGram);
  } catch (e) {
    // Shop metafields may require scopes not in the standard list; product updates still use in-memory rates
    console.warn("Could not write shop metafields (silver/gold price per gram):", e);
  }

  const errors: string[] = [];
  const skipped: Array<{ productId: string; reason: string }> = [];
  let updated = 0;
  let cursor: string | null = null;

  console.log("[metal-prices] Update started (DEBUG_METAL_PRICES=%s)", DEBUG ? "on" : "off");

  do {
    const query = `
      query getProducts($cursor: String) {
        products(first: 50, after: $cursor, query: "status:active") {
          pageInfo { hasNextPage endCursor }
          edges {
            node {
              id
              metafields(first: 50, namespace: "${NAMESPACE}") {
                nodes {
                  key
                  value
                }
              }
              variants(first: 100) {
                edges { node { id } }
              }
            }
          }
        }
      }
    `;
    const res = await admin.graphql(query, { variables: { cursor } });
    const json = (await res.json()) as {
      data?: {
        products?: {
          pageInfo: { hasNextPage: boolean; endCursor: string | null };
          edges: Array<{
            node: {
              id: string;
              metafields: { nodes: Array<{ key: string; value: string }> };
              variants: { edges: Array<{ node: { id: string } }> };
            };
          }>;
        };
      };
    };

    const products = json.data?.products;
    if (!products) break;

    for (const edge of products.edges) {
      const product = edge.node;
      const nodes = product.metafields?.nodes ?? [];
      const get = (key: string) => nodes.find((n) => n.key === key)?.value;

      const rawSilver = get(SILVER_WEIGHT_KEY);
      const rawGold = get(GOLD_WEIGHT_KEY);
      const marginStr = (get(MARGIN_PERCENTAGE_KEY) ?? "").trim();
      const silverWeightGram = parseWeightGram(rawSilver);
      const goldWeightGram = parseWeightGram(rawGold);

      if (DEBUG) {
        const keys = nodes.map((n) => n.key).join(", ");
        console.log("[DEBUG_METAL_PRICES] product=%s metafield_keys=[%s] silver_raw=%s gold_raw=%s margin_raw=%s -> silver=%s gold=%s",
          product.id, keys, JSON.stringify(rawSilver), JSON.stringify(rawGold), JSON.stringify(marginStr), silverWeightGram, goldWeightGram);
      }

      if (silverWeightGram <= 0 && goldWeightGram <= 0) {
        skipped.push({ productId: product.id, reason: "both silver and gold weight missing or non-positive" });
        if (DEBUG) console.log("[DEBUG_METAL_PRICES] SKIP product=%s reason=both weights missing or non-positive", product.id);
        continue;
      }
      if (Number.isNaN(silverWeightGram) || Number.isNaN(goldWeightGram)) {
        skipped.push({ productId: product.id, reason: "invalid silver or gold weight (non-numeric)" });
        if (DEBUG) console.log("[DEBUG_METAL_PRICES] SKIP product=%s reason=invalid weight (NaN)", product.id);
        continue;
      }

      const marginPercent =
        marginStr !== "" ? parseFloat(marginStr) : defaultMarkupPercent;
      if (Number.isNaN(marginPercent) || marginPercent < 0) {
        skipped.push({ productId: product.id, reason: "invalid or negative margin_percentage" });
        if (DEBUG) console.log("[DEBUG_METAL_PRICES] SKIP product=%s reason=invalid margin", product.id);
        continue;
      }

      const priceEur = computeProductPriceEur(
        silverPricePerGram,
        goldPricePerGram,
        silverWeightGram,
        goldWeightGram,
        marginPercent
      );
      const priceStr = priceEur.toFixed(2);

      const variantIds = product.variants.edges.map((e) => e.node.id);
      if (variantIds.length === 0) {
        skipped.push({ productId: product.id, reason: "no variants" });
        if (DEBUG) console.log("[DEBUG_METAL_PRICES] SKIP product=%s reason=no variants", product.id);
        continue;
      }

      if (DEBUG) console.log("[DEBUG_METAL_PRICES] UPDATE product=%s priceEur=%s variantCount=%s", product.id, priceEur.toFixed(2), variantIds.length);

      try {
        const mutation = `
          mutation updateVariants($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
            productVariantsBulkUpdate(productId: $productId, variants: $variants) {
              productVariants { id price }
              userErrors { field message }
            }
          }
        `;
        const variants = variantIds.map((id) => ({ id, price: priceStr }));
        const mutRes = await admin.graphql(mutation, {
          variables: { productId: product.id, variants },
        });
        const mutJson = (await mutRes.json()) as {
          data?: {
            productVariantsBulkUpdate?: {
              userErrors: Array<{ field: string[]; message: string }>;
            };
          };
        };
        const userErrors = mutJson.data?.productVariantsBulkUpdate?.userErrors ?? [];
        if (userErrors.length > 0) {
          errors.push(`Product ${product.id}: ${userErrors.map((e) => e.message).join(", ")}`);
        } else {
          updated += variantIds.length;
        }
      } catch (e) {
        errors.push(`Product ${product.id}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    cursor = products.pageInfo.hasNextPage ? products.pageInfo.endCursor : null;
  } while (cursor);

  console.log("[metal-prices] Update finished: updated=%s skipped=%s errors=%s", updated, skipped.length, errors.length);
  if (skipped.length > 0 && !DEBUG) {
    console.log("[metal-prices] Set DEBUG_METAL_PRICES=1 for per-product skip reasons");
  }

  return { updated, errors, skipped };
}
