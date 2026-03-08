import "@shopify/shopify-app-remix/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  BillingInterval,
  shopifyApp,
} from "@shopify/shopify-app-remix/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import { randomBytes } from "node:crypto";
import prisma from "./db.server";

/** Plan key for Shopify billing config; €9.99/mo recurring. */
export const PREMIUM_PLAN = "Premium Plan";

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.January25,
  scopes: process.env.SCOPES?.split(","),
  appUrl: process.env.SHOPIFY_APP_URL || "",
  authPathPrefix: "/auth",
  sessionStorage: new PrismaSessionStorage(prisma),
  distribution: AppDistribution.AppStore,
  billing: {
    [PREMIUM_PLAN]: {
      lineItems: [
        {
          amount: 9.99,
          currencyCode: "EUR",
          interval: BillingInterval.Every30Days,
        },
      ],
    },
  },
  hooks: {
    afterAuth: async ({ session }) => {
      const shop = session.shop;
      const existing = await prisma.appSettings.findUnique({
        where: { shop },
      });
      const cronToken =
        existing?.cronToken ?? randomBytes(32).toString("hex");
      await prisma.appSettings.upsert({
        where: { shop },
        create: {
          shop,
          cronToken,
        },
        update: existing?.cronToken ? {} : { cronToken },
      });
    },
  },
  future: {
    unstable_newEmbeddedAuthStrategy: true,
    expiringOfflineAccessTokens: true,
  },
  ...(process.env.SHOP_CUSTOM_DOMAIN
    ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
    : {}),
});

export default shopify;
export const apiVersion = ApiVersion.January25;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;
