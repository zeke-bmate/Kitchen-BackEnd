/*
  Warnings:

  - You are about to drop the column `currentWeightKg` on the `RawIngredient` table. All the data in the column will be lost.
  - Added the required column `currentQuantity` to the `RawIngredient` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_RawIngredient" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "currentQuantity" REAL NOT NULL,
    "canonicalUnit" TEXT NOT NULL DEFAULT 'KG',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_RawIngredient" (
  "canonicalUnit",
  "createdAt",
  "currentQuantity",
  "id",
  "name"
)
SELECT
  "canonicalUnit",
  "createdAt",
  "currentWeightKg",
  "id",
  "name"
FROM "RawIngredient";
DROP TABLE "RawIngredient";
ALTER TABLE "new_RawIngredient" RENAME TO "RawIngredient";
CREATE UNIQUE INDEX "RawIngredient_name_key" ON "RawIngredient"("name");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
