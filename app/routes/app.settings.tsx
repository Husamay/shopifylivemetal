import { type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  FormLayout,
  TextField,
  Button,
  BlockStack,
  Text,
  Banner,
  Select,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { useState, useEffect } from "react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const settings = await prisma.appSettings.findUnique({
    where: { shop: session.shop },
  });
  return {
    metalApiKey: settings?.metalApiKey ?? "",
    markupPercent: settings?.markupPercent ?? "15",
    priceUpdateSchedule: settings?.priceUpdateSchedule ?? "daily",
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const metalApiKey = (formData.get("metalApiKey") as string)?.trim() ?? "";
  const markupPercent = (formData.get("markupPercent") as string)?.trim() || "15";
  const priceUpdateSchedule =
    (formData.get("priceUpdateSchedule") as string) || "daily";
  const validSchedules = ["manual", "daily", "hourly"];
  const schedule =
    validSchedules.includes(priceUpdateSchedule) ? priceUpdateSchedule : "daily";

  const markup = parseFloat(markupPercent);
  if (Number.isNaN(markup) || markup < 0) {
    return { ok: false, error: "Markup must be a non-negative number." };
  }

  await prisma.appSettings.upsert({
    where: { shop: session.shop },
    create: {
      shop: session.shop,
      metalApiKey: metalApiKey || null,
      markupPercent: markupPercent,
      priceUpdateSchedule: schedule,
    },
    update: {
      metalApiKey: metalApiKey || null,
      markupPercent: markupPercent,
      priceUpdateSchedule: schedule,
    },
  });

  return { ok: true };
};

const SCHEDULE_OPTIONS: { label: string; value: string }[] = [
  { label: "Manual only (no automatic updates; be wary of rate limit of 100 requests/month)", value: "manual" },
  { label: "Twice a day (only for premium users; good for free API tier from metalpriceapi.com)", value: "daily" },
  { label: "Every hour (only for premium users; requires Essential tier($3.99/month) from metalpriceapi.com)", value: "hourly" }
];

export default function Settings() {
  const { metalApiKey, markupPercent, priceUpdateSchedule } =
    useLoaderData<typeof loader>();
  const fetcher = useFetcher<{ ok?: boolean; error?: string }>();
  const [apiKey, setApiKey] = useState(metalApiKey);
  const [markup, setMarkup] = useState(markupPercent);
  const [schedule, setSchedule] = useState(priceUpdateSchedule);
  useEffect(() => {
    setApiKey(metalApiKey);
    setMarkup(markupPercent);
    setSchedule(priceUpdateSchedule);
  }, [metalApiKey, markupPercent, priceUpdateSchedule]);

  const handleSubmit = () => {
    const form = new FormData();
    form.set("metalApiKey", apiKey);
    form.set("markupPercent", markup);
    form.set("priceUpdateSchedule", schedule);
    fetcher.submit(form, { method: "post" });
  };

  return (
    <Page>
      <TitleBar title="Settings" />
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">
                Metal Price API & pricing
              </Text>
              <FormLayout>
                <TextField
                  label="Metal Price API key"
                  type="password"
                  value={apiKey}
                  onChange={setApiKey}
                  autoComplete="off"
                  helpText="Get a free key at metalpriceapi.com. Free tier: 100 requests/month; use 'Update prices now' once per day."
                />
                <TextField
                  label="Markup (%) (overridden by product metafield margin_percentage)"
                  type="number"
                  value={markup}
                  onChange={setMarkup}
                  min={0}
                  step={0.5}
                  autoComplete="off"
                  helpText="Applied as: price = weight × metal rate × (1 + markup/100). Example: 15 = 15% markup."
                />
                <Select
                  label="Automatic price updates"
                  options={SCHEDULE_OPTIONS}
                  value={schedule}
                  onChange={setSchedule}
                  helpText="Cron runs every hour. Daily = twice per 24h (free tier). Hourly = every run (paid tier). Manual = use 'Update prices now' only."
                />
                <Button
                  variant="primary"
                  onClick={handleSubmit}
                  loading={fetcher.state === "submitting"}
                >
                  Save
                </Button>
              </FormLayout>
              {fetcher.data?.ok === true && (
                <Banner tone="success" title="Settings saved." />
              )}
              {fetcher.data?.ok === false && fetcher.data.error && (
                <Banner tone="critical" title={fetcher.data.error} />
              )}
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
