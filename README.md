# Live Metal – Shopify app

Update Shopify product prices from the **Metal Price API** (silver/gold) and sell in **EUR**. The app writes current metal prices to shop metafields and updates variant prices for products that have weight and margin metafields.

---

## Quick start – run the app and see the button

1. **Start the app** (from the project root):
   ```bash
   npm install
   npm run dev
   ```
2. In the terminal, the Shopify CLI will show a **tunnel URL** (e.g. `https://xxxx.ngrok-free.app`). Copy it.
3. **Set that URL as your app’s URL**  
   - Open `shopify.app.live-metal-price-update.toml` and set:
     - `application_url = "https://YOUR-TUNNEL-URL"` (the URL from step 2, no trailing slash)
     - `redirect_urls = [ "https://YOUR-TUNNEL-URL/api/auth" ]`
   - Or in **Shopify Partners** → your app → **App setup** → set **App URL** and **Allowed redirection URL(s)** to that same base URL (and `/api/auth` for redirect).
4. **Open the app in your store**  
   In the admin: **Apps** → **Live Metal** (or **Settings** → **Apps and sales channels** → **Live Metal** → **Open app**).
5. You should see the **Home** page with the **“Update prices now”** button. Use **Settings** in the app to add your Metal Price API key and default markup.

If you see a blank page or “This site can’t be reached”, the store is loading the wrong URL: make sure `application_url` in the TOML (and in Partners) is exactly the tunnel URL from `npm run dev`.

**If the CLI shows "Update URLs: Not yet configured"** (no tunnel): the config has `[build]` with `automatically_update_urls_on_dev = true`. Run once: `npm run dev -- --reset`, then use the tunnel URL the CLI prints. If no tunnel appears (e.g. firewall), use ngrok: `ngrok http 3000`, put that URL in the TOML, then `npm run dev -- --tunnel-url=https://YOUR-NGROK-URL:3000`.

---

- **Metal Price API** (free tier): 100 requests/month; run “Update prices now” once per day.
- **Shop metafields** (set by app): `custom.silver_price_per_gram`, `custom.gold_price_per_gram`.
- **Product metafields** (you add): `custom.margin_percentage`, `custom.silver_weight_gram`, `custom.gold_weight_gram`.
- **Formula**: price = (silver_price_per_gram × silver_weight_gram + gold_price_per_gram × gold_weight_gram) × (1 + margin_percentage/100). Use one or both weight fields per product.
- **Trigger**: Prices update only when you click **Update prices now** in the app (no automatic schedule).
- Store currency should be **EUR**.

---

## Setup

### 1. Shopify app (Partners + env)

- Create an app in [Shopify Partners](https://partners.shopify.com) (or use the CLI).
- Copy `.env.example` to `.env` and set:
  - `DATABASE_URL="file:dev.sqlite"`
  - Shopify credentials: `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`, `SCOPES`, `SHOPIFY_APP_URL` (from Partners or after linking).
- Run `npm install` then `npm run dev`; complete CLI login and config link.
- **Scopes**: `read_products`, `write_products` (valid Shopify access scopes). The app will try to write shop metafields when possible; product prices always update using the current API rates.

### 2. App URL in Partners (required to open the app)

Shopify needs a **public** URL to load your app. Do **not** use `localhost`.

- **Local development**: Run `npm run dev`; the CLI shows a **tunnel URL** (e.g. `https://xxxx.ngrok-free.app`). In Partners → your app → **App setup** → **App URL**, set that tunnel URL. Redirect URLs must use the same host.
- **Production**: Set **App URL** to your live domain (e.g. `https://shopifylivemetal.flameforge.work`).

Without a valid App URL, the app will not open from the admin.

### 3. Metal Price API

- Sign up at [metalpriceapi.com](https://metalpriceapi.com) and get an API key (free tier).
- In the app: open **Settings** (in the app nav), enter the API key and **Markup (%)** (default margin when a product has no `margin_percentage`). Save.

### 4. Metafields

**Shop** (set by the app when you run “Update prices now”):

| Namespace | Key                     | Type           |
|-----------|-------------------------|----------------|
| `custom`  | `silver_price_per_gram` | number_decimal |
| `custom`  | `gold_price_per_gram`   | number_decimal |

**Product** (you add for each product that follows metal pricing):

| Namespace | Key                    | Type           | Example / use      |
|-----------|------------------------|----------------|--------------------|
| `custom`  | `margin_percentage`    | number_decimal | 15 = 15% margin   |
| `custom`  | `silver_weight_gram`   | number_decimal | Silver weight (g)  |
| `custom`  | `gold_weight_gram`     | number_decimal | Gold weight (g)   |

- Use **one or both** weight fields per product (silver only, gold only, or both).
- Create definitions in **Settings → Custom data → Products** (namespace `custom`, keys above).

### 5. Store currency

Set your store (or market) currency to **EUR**.

---

## Usage

### Opening the app in Shopify admin

- **Apps** (left sidebar) → **Live Metal** → opens the app, or  
- **Settings** → **Apps and sales channels** → **Live Metal** → **Open app**.

The app has two pages: **Home** (update prices) and **Settings** (API key, default markup). If you see “This app is not listed in the Shopify App Store”, that is normal for unlisted/custom apps.

### Updating prices

1. Open the app (see above).
2. On **Home**, click **Update prices now**.
3. The app: calls the Metal Price API once → writes `custom.silver_price_per_gram` and `custom.gold_price_per_gram` on the shop → updates variant prices for all products that have the required product metafields.

Prices change **only** when you click that button (no built-in cron). To run daily, use the button once per day or add your own cron endpoint.

---

## Tech

- **Stack**: Node, Remix, Prisma (SQLite), Shopify App Bridge, Polaris.
- **API**: [Metal Price API](https://metalpriceapi.com/documentation) (EU endpoint, EUR).

---

## Development

```bash
cp .env.example .env
# Edit .env: DATABASE_URL and Shopify credentials
npm install
npm run dev
```

Use the **tunnel URL** from the CLI as the App URL in Partners. Open the app from your dev store via **Apps** → **Live Metal**.

### Debugging price updates

If some products are not updating (e.g. silver-only or gold-only):

1. **Cron response** – Call your cron URL (e.g. `GET /cron/update-prices?secret=YOUR_CRON_SECRET`). The JSON response includes per-shop `skipped`: an array of `{ productId, reason }`. Check whether your product is in `skipped` and which `reason` it has (e.g. `"both silver and gold weight missing or non-positive"`, `"invalid silver or gold weight (non-numeric)"`, `"no variants"`).

2. **Server logs** – Set `DEBUG_METAL_PRICES=1` in your environment (e.g. in `.env` or in the shell before `npm run dev`), then run **Update prices now** or trigger the cron. The server will log for each product:
   - `product` (GID), `metafield_keys` (which custom keys were returned), `silver_raw`, `gold_raw`, `margin_raw`, and the parsed `silver` / `gold` weights.
   - Either `SKIP product=... reason=...` or `UPDATE product=... priceEur=... variantCount=...`

Use this to confirm:
- The product’s `custom` metafields are actually returned (if you have many custom metafields, the query requests up to 50; keys must be `silver_weight_gram` and `gold_weight_gram`).
- Raw values are what you expect (e.g. silver-only products should have a non-empty `silver_raw` and empty or missing `gold_raw`).
- Parsed weights (e.g. silver-only → gold parsed as 0) and that the product is not skipped for another reason.

---

## Running with Docker

- **Compose**: `docker compose up --build`. App listens on 8080 in the container; host port 3000 maps to it. Database: volume `live-metal-data`.
- **Tasks** (VS Code / Cursor): **Terminal** → **Run Task** → **Build all stack: docker**, **Run all stack: docker**, or **Deploy all stack: docker**.
- **Manual**: `docker build -t shopify-live-metal .` then `docker run -p 3000:8080 --env-file .env -v live-metal-data:/app/data shopify-live-metal`.

For production, deploy the image and set `SHOPIFY_APP_URL` to your public URL. Use **Caddyfile.example** in the repo as a template for reverse proxy (e.g. `shopifylivemetal.flameforge.work` → your app).

---

## Hosting and distribution

- **Server**: The app must run on a host that is reachable on the internet (e.g. VPS, Fly.io, Railway, Render). Set the app’s URLs in Partners and env vars (`SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`, `SCOPES`, `SHOPIFY_APP_URL`, `DATABASE_URL`).
- **Distribution**: List in the [Shopify App Store](https://shopify.dev/docs/apps/store/requirements) (with review) or share an install link from Partners for unlisted/custom distribution.
