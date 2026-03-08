import { useState } from "react";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { useFetcher, useLoaderData } from "@remix-run/react";
import {
  Page,
  Layout,
  Text,
  Card,
  Button,
  BlockStack,
  Banner,
  InlineStack,
  Box,
  List,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const settings = await prisma.appSettings.findUnique({
    where: { shop },
    select: { plan: true, cronToken: true },
  });
  const appUrl =
    process.env.SHOPIFY_APP_URL ||
    new URL(request.url).origin;
  const cronUrl =
    settings?.cronToken &&
    `${appUrl.replace(/\/$/, "")}/api/execute-task?shop=${encodeURIComponent(shop)}&token=${encodeURIComponent(settings.cronToken)}`;
  return {
    plan: settings?.plan ?? "free",
    cronUrl: cronUrl ?? null,
    billingStatus: new URL(request.url).searchParams.get("billing"),
  };
};

export default function Index() {
  const { plan, cronUrl, billingStatus } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<{
    ok?: boolean;
    error?: string;
    updated?: number;
    errors?: string[];
  }>();
  const [dismissBanner, setDismissBanner] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [copiedSnippet, setCopiedSnippet] = useState<"silver" | "gold" | null>(null);

  const isRunning =
    fetcher.state === "submitting" || fetcher.state === "loading";
  const data = fetcher.data;
  const silverLiquidSnippet = `<div class="custom-shop-metafield" style="margin-top: 10px; font-size: 0.9em;">
  Silver Rate: {{ shop.metafields.custom.silver_price_per_gram.value }} per gram
</div>`;
  const goldLiquidSnippet = `<div class="custom-shop-metafield" style="margin-top: 10px; font-size: 0.9em;">
  Gold Rate: {{ shop.metafields.custom.gold_price_per_gram.value }} per gram
</div>`;

  const handleCopyUrl = () => {
    if (cronUrl) {
      void navigator.clipboard.writeText(cronUrl).then(() => {
        setCopySuccess(true);
        setTimeout(() => setCopySuccess(false), 2000);
      });
    }
  };

  const handleCopySnippet = (snippet: string, key: "silver" | "gold") => {
    void navigator.clipboard.writeText(snippet).then(() => {
      setCopiedSnippet(key);
      setTimeout(() => setCopiedSnippet(null), 2000);
    });
  };

  return (
    <Page>
      <TitleBar title="Live Metal" />
      <BlockStack gap="500">
        {billingStatus === "success" && !dismissBanner && (
          <Banner
            title="Premium activated"
            onDismiss={() => setDismissBanner(true)}
            tone="success"
          >
            You can now use the Scheduled Sync URL with external cron services.
          </Banner>
        )}
        {billingStatus === "cancelled" && !dismissBanner && (
          <Banner onDismiss={() => setDismissBanner(true)}>
            Billing was not activated. You can upgrade anytime to unlock scheduled sync.
          </Banner>
        )}
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Update prices from metal rates
                </Text>
                <BlockStack gap="200">
                  <Text as="p" variant="bodyMd" tone="subdued">
                    This action updates your metal-based prices in three steps:
                  </Text>
                  <List type="bullet">
                    <List.Item>
                      Set shop metafields <code>custom.silver_price_per_gram</code> and{" "}
                      <code>custom.gold_price_per_gram</code> from the Metal Price API.
                    </List.Item>
                    <List.Item>
                      For products with <code>custom.margin_percentage</code> and one or both weight metafields (
                      <code>custom.silver_weight_gram</code>, <code>custom.gold_weight_gram</code>), recalculate
                      variant prices.
                    </List.Item>
                    <List.Item>
                      Apply formula: <code>price = metal price x weight x (1 + margin/100)</code>.
                    </List.Item>
                  </List>
                  <Text as="p" variant="bodySm" tone="subdued">
                    Recommended store currency: EUR.
                  </Text>
                </BlockStack>
                <fetcher.Form method="post" action="/api/execute-task">
                  <InlineStack gap="300">
                    <Button
                      variant="primary"
                      submit
                      loading={isRunning}
                      disabled={isRunning}
                    >
                      Update prices now
                    </Button>
                  </InlineStack>
                </fetcher.Form>
                <Text as="p" variant="bodySm" tone="subdued">
                  Metal prices provided by{" "}
                  <a href="https://metalpriceapi.com" target="_blank" rel="noopener noreferrer">
                    metalpriceapi.com
                  </a>
                  .
                </Text>
                {data?.ok === true && !dismissBanner && (
                  <Banner
                    title="Prices updated"
                    onDismiss={() => setDismissBanner(true)}
                    tone="success"
                  >
                    <p>
                      Updated {data.updated} variant(s) to current metal prices in EUR.
                      {data.errors && data.errors.length > 0 && (
                        <> Some errors: {data.errors.join("; ")}</>
                      )}
                    </p>
                  </Banner>
                )}
                {data?.ok === false && data.error && !dismissBanner && (
                  <Banner
                    title="Update failed"
                    onDismiss={() => setDismissBanner(true)}
                    tone="critical"
                    action={{
                      content: "Open Settings",
                      url: "/app/settings",
                    }}
                  >
                    <p>{data.error}</p>
                  </Banner>
                )}
              </BlockStack>
            </Card>
            <Box paddingBlockStart="400">
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">
                    Scheduled Sync
                  </Text>
                  <Text as="p" variant="bodyMd" tone="subdued">
                    Use our cron service to run price updates on a schedule.
                  </Text>
                  {plan === "free" ? (
                    <InlineStack gap="300">
                      <Button url="/api/billing/upgrade" variant="primary">
                        Upgrade to Unlock Automation
                      </Button>
                    </InlineStack>
                  ) : cronUrl ? (
                    <BlockStack gap="200">
                      <Text as="p" variant="bodySm" fontWeight="semibold">
                        Your Cron URL (POST):
                      </Text>
                      <Box paddingBlockEnd="200">
                        <InlineStack gap="200" blockAlign="center">
                          <code style={{ wordBreak: "break-all", fontSize: "12px" }}>
                            {cronUrl}
                          </code>
                          <Button size="slim" onClick={handleCopyUrl}>
                            {copySuccess ? "Copied" : "Copy"}
                          </Button>
                        </InlineStack>
                      </Box>
                    </BlockStack>
                  ) : (
                    <Text as="p" variant="bodySm" tone="subdued">
                      Reload the app to generate your cron URL.
                    </Text>
                  )}
                </BlockStack>
              </Card>
            </Box>
          </Layout.Section>
          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="300">
                <Text as="h3" variant="headingSm">
                  Metafields
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  <strong>Shop</strong> (updated by app): <code>custom.silver_price_per_gram</code>,{" "}
                  <code>custom.gold_price_per_gram</code>.
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  <strong>Product</strong> namespace <code>custom</code>:
                </Text>
                <BlockStack gap="200">
                  <Text as="p" variant="bodySm">
                    <strong>margin_percentage(optional)</strong> (number): e.g. 15 = 15% margin
                  </Text>
                  <Text as="p" variant="bodySm">
                    <strong>silver_weight_gram</strong> (number): silver weight in grams
                  </Text>
                  <Text as="p" variant="bodySm">
                    <strong>gold_weight_gram</strong> (number): gold weight in grams
                  </Text>
                </BlockStack>
                <BlockStack gap="150">
                  <List type="bullet">
                    <List.Item>Use one or both weight fields.</List.Item>
                    <List.Item>
                      Formula:{" "}
                      <code>
                        price = (silver price x silver weight + gold price x gold weight) x (1 + margin/100)
                      </code>
                      .
                    </List.Item>
                  </List>
                </BlockStack>
                <Text as="p" variant="bodySm" tone="subdued">
                  Theme usage snippets:
                </Text>
                <BlockStack gap="200">
                  <Text as="p" variant="bodySm" fontWeight="semibold">
                    Silver rate
                  </Text>
                  <Box background="bg-surface-secondary" borderRadius="200" padding="300">
                    <code
                      style={{
                        whiteSpace: "pre-wrap",
                        overflowWrap: "anywhere",
                        wordBreak: "break-word",
                        display: "block",
                        fontSize: "12px",
                        lineHeight: "1.4",
                      }}
                    >
                      {silverLiquidSnippet}
                    </code>
                  </Box>
                  <InlineStack>
                    <Button size="slim" onClick={() => handleCopySnippet(silverLiquidSnippet, "silver")}>
                      {copiedSnippet === "silver" ? "Copied" : "Copy silver snippet"}
                    </Button>
                  </InlineStack>
                  <Text as="p" variant="bodySm" fontWeight="semibold">
                    Gold rate
                  </Text>
                  <Box background="bg-surface-secondary" borderRadius="200" padding="300">
                    <code
                      style={{
                        whiteSpace: "pre-wrap",
                        overflowWrap: "anywhere",
                        wordBreak: "break-word",
                        display: "block",
                        fontSize: "12px",
                        lineHeight: "1.4",
                      }}
                    >
                      {goldLiquidSnippet}
                    </code>
                  </Box>
                  <InlineStack>
                    <Button size="slim" onClick={() => handleCopySnippet(goldLiquidSnippet, "gold")}>
                      {copiedSnippet === "gold" ? "Copied" : "Copy gold snippet"}
                    </Button>
                  </InlineStack>
                </BlockStack>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}
