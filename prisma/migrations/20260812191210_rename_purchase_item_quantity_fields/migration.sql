/*
  Warnings:

  - You are about to drop the column `pricePerKg` on the `PurchaseItem` table. All the data in the column will be lost.
  - You are about to drop the column `weightKg` on the `PurchaseItem` table. All the data in the column will be lost.
  - Added the required column `pricePerUnit` to the `PurchaseItem` table without a default value. This is not possible if the table is not empty.
  - Added the required column `quantity` to the `PurchaseItem` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_PurchaseItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "purchaseId" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "orderUnits" TEXT,
    "quantity" REAL NOT NULL,
    "pricePerUnit" REAL NOT NULL,
    "totalPrice" REAL NOT NULL,
    "rawIngredientId" TEXT,
    CONSTRAINT "PurchaseItem_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PurchaseItem_rawIngredientId_fkey" FOREIGN KEY ("rawIngredientId") REFERENCES "RawIngredient" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_PurchaseItem" (
  "id",
  "itemName",
  "orderUnits",
  "purchaseId",
  "rawIngredientId",
  "quantity",
  "pricePerUnit",
  "totalPrice"
)
SELECT
  "id",
  "itemName",
  "orderUnits",
  "purchaseId",
  "rawIngredientId",
  "weightKg",
  "pricePerKg",
  "totalPrice"
FROM "PurchaseItem";
DROP TABLE "PurchaseItem";
ALTER TABLE "new_PurchaseItem" RENAME TO "PurchaseItem";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
