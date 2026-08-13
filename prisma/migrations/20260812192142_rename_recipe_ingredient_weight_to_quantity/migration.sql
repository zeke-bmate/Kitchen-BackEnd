/*
  Warnings:

  - You are about to drop the column `weightKg` on the `RecipeIngredient` table. All the data in the column will be lost.
  - Added the required column `quantity` to the `RecipeIngredient` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_RecipeIngredient" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "recipeId" TEXT NOT NULL,
    "rawIngredientId" TEXT NOT NULL,
    "quantity" REAL NOT NULL,
    CONSTRAINT "RecipeIngredient_rawIngredientId_fkey" FOREIGN KEY ("rawIngredientId") REFERENCES "RawIngredient" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "RecipeIngredient_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_RecipeIngredient" (
  "id",
  "rawIngredientId",
  "recipeId",
  "quantity"
)
SELECT
  "id",
  "rawIngredientId",
  "recipeId",
  "weightKg"
FROM "RecipeIngredient";
DROP TABLE "RecipeIngredient";
ALTER TABLE "new_RecipeIngredient" RENAME TO "RecipeIngredient";
CREATE UNIQUE INDEX "RecipeIngredient_recipeId_rawIngredientId_key" ON "RecipeIngredient"("recipeId", "rawIngredientId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
