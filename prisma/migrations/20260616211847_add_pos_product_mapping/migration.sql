-- CreateTable
CREATE TABLE "POSProductMapping" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "posProductName" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "POSProductMapping_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "POSProductMapping_posProductName_key" ON "POSProductMapping"("posProductName");
