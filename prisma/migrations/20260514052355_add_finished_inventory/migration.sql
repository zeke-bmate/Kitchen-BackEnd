-- CreateTable
CREATE TABLE "FinishedInventory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "recipeId" TEXT NOT NULL,
    "quantityAvailable" REAL NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FinishedInventory_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "FinishedInventory_recipeId_key" ON "FinishedInventory"("recipeId");
