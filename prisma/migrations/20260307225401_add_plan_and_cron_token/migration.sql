-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AppSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "metalApiKey" TEXT,
    "markupPercent" TEXT NOT NULL DEFAULT '15',
    "priceUpdateSchedule" TEXT NOT NULL DEFAULT 'daily',
    "lastPriceUpdateAt" DATETIME,
    "plan" TEXT NOT NULL DEFAULT 'free',
    "cronToken" TEXT,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_AppSettings" ("id", "lastPriceUpdateAt", "markupPercent", "metalApiKey", "priceUpdateSchedule", "shop", "updatedAt") SELECT "id", "lastPriceUpdateAt", "markupPercent", "metalApiKey", "priceUpdateSchedule", "shop", "updatedAt" FROM "AppSettings";
DROP TABLE "AppSettings";
ALTER TABLE "new_AppSettings" RENAME TO "AppSettings";
CREATE UNIQUE INDEX "AppSettings_shop_key" ON "AppSettings"("shop");
CREATE UNIQUE INDEX "AppSettings_cronToken_key" ON "AppSettings"("cronToken");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
