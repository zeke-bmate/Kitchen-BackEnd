/*
  Warnings:

  - You are about to drop the column `newWeightKg` on the `InventoryTransaction` table. All the data in the column will be lost.
  - You are about to drop the column `previousWeightKg` on the `InventoryTransaction` table. All the data in the column will be lost.
  - You are about to drop the column `quantityChangeKg` on the `InventoryTransaction` table. All the data in the column will be lost.
  - Added the required column `newQuantity` to the `InventoryTransaction` table without a default value. This is not possible if the table is not empty.
  - Added the required column `previousQuantity` to the `InventoryTransaction` table without a default value. This is not possible if the table is not empty.
  - Added the required column `quantityChange` to the `InventoryTransaction` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_InventoryTransaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "rawIngredientId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "quantityChange" REAL NOT NULL,
    "previousQuantity" REAL NOT NULL,
    "newQuantity" REAL NOT NULL,
    "reason" TEXT,
    "purchaseId" TEXT,
    "productionBatchId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InventoryTransaction_rawIngredientId_fkey" FOREIGN KEY ("rawIngredientId") REFERENCES "RawIngredient" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "InventoryTransaction_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "InventoryTransaction_productionBatchId_fkey" FOREIGN KEY ("productionBatchId") REFERENCES "ProductionBatch" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_InventoryTransaction" (
  "createdAt",
  "id",
  "productionBatchId",
  "purchaseId",
  "rawIngredientId",
  "reason",
  "type",
  "quantityChange",
  "previousQuantity",
  "newQuantity"
)
SELECT
  "createdAt",
  "id",
  "productionBatchId",
  "purchaseId",
  "rawIngredientId",
  "reason",
  "type",
  "quantityChangeKg",
  "previousWeightKg",
  "newWeightKg"
FROM "InventoryTransaction";
DROP TABLE "InventoryTransaction";
ALTER TABLE "new_InventoryTransaction" RENAME TO "InventoryTransaction";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
