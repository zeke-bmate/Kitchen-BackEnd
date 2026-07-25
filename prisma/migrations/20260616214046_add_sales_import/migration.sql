-- CreateTable
CREATE TABLE "SalesImport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "posProductName" TEXT NOT NULL,
    "quantitySold" REAL NOT NULL,
    "recipeId" TEXT NOT NULL,
    "importedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SalesImport_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
