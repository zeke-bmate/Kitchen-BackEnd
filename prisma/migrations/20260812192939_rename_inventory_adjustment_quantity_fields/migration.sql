/*
  Warnings:

  - You are about to drop the column `newWeightKg` on the `InventoryAdjustment` table. All the data in the column will be lost.
  - You are about to drop the column `previousWeightKg` on the `InventoryAdjustment` table. All the data in the column will be lost.
  - Added the required column `newQuantity` to the `InventoryAdjustment` table without a default value. This is not possible if the table is not empty.
  - Added the required column `previousQuantity` to the `InventoryAdjustment` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_InventoryAdjustment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "rawIngredientId" TEXT NOT NULL,
    "previousQuantity" REAL NOT NULL,
    "newQuantity" REAL NOT NULL,
    "reason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InventoryAdjustment_rawIngredientId_fkey" FOREIGN KEY ("rawIngredientId") REFERENCES "RawIngredient" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_InventoryAdjustment" (
  "createdAt",
  "id",
  "rawIngredientId",
  "reason",
  "previousQuantity",
  "newQuantity"
)
SELECT
  "createdAt",
  "id",
  "rawIngredientId",
  "reason",
  "previousWeightKg",
  "newWeightKg"
FROM "InventoryAdjustment";
DROP TABLE "InventoryAdjustment";
ALTER TABLE "new_InventoryAdjustment" RENAME TO "InventoryAdjustment";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
