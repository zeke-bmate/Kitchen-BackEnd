-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_RawIngredient" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "currentWeightKg" REAL NOT NULL,
    "canonicalUnit" TEXT NOT NULL DEFAULT 'KG',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_RawIngredient" ("createdAt", "currentWeightKg", "id", "name") SELECT "createdAt", "currentWeightKg", "id", "name" FROM "RawIngredient";
DROP TABLE "RawIngredient";
ALTER TABLE "new_RawIngredient" RENAME TO "RawIngredient";
CREATE UNIQUE INDEX "RawIngredient_name_key" ON "RawIngredient"("name");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
