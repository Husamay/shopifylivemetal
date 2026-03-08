import type { LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLoaderData,
} from "@remix-run/react";
import { AppProvider } from "@shopify/shopify-app-remix/react";
import { NavMenu } from "@shopify/app-bridge-react";
import { Link } from "@remix-run/react";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";

export const links = () => [
  { rel: "stylesheet", href: polarisStyles },
  { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
  { rel: "shortcut icon", type: "image/svg+xml", href: "/favicon.svg" },
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  // Embedded app loads at / with query params; redirect so /app handles it.
  if (url.pathname === "/") {
    return redirect(`/app${url.search}`);
  }
  // Cron routes are unauthenticated; secured by CRON_SECRET in the route.
  if (url.pathname.startsWith("/cron")) {
    return json({ apiKey: process.env.SHOPIFY_API_KEY ?? "" });
  }
  // Execute-task POST is allowed unauthenticated; route validates shop+token for external cron.
  if (url.pathname === "/api/execute-task" && request.method === "POST") {
    return json({ apiKey: process.env.SHOPIFY_API_KEY ?? "" });
  }
  const { authenticate } = await import("./shopify.server");
  await authenticate.admin(request);
  return json({
    apiKey: process.env.SHOPIFY_API_KEY ?? "",
  });
};

export default function App() {
  const { apiKey } = useLoaderData<typeof loader>();

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="preconnect" href="https://cdn.shopify.com/" />
        <link
          rel="stylesheet"
          href="https://cdn.shopify.com/static/fonts/inter/v4/styles.css"
        />
        <Meta />
        <Links />
      </head>
      <body>
        <AppProvider isEmbeddedApp apiKey={apiKey}>
          <NavMenu>
            <Link to="/app" rel="home">
              Home
            </Link>
            <Link to="/app/settings">Settings</Link>
          </NavMenu>
          <Outlet />
        </AppProvider>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
