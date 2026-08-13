-- CreateTable
CREATE TABLE "InventoryTransaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "rawIngredientId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "quantityChangeKg" REAL NOT NULL,
    "previousWeightKg" REAL NOT NULL,
    "newWeightKg" REAL NOT NULL,
    "reason" TEXT,
    "purchaseId" TEXT,
    "productionBatchId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InventoryTransaction_rawIngredientId_fkey" FOREIGN KEY ("rawIngredientId") REFERENCES "RawIngredient" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "InventoryTransaction_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "InventoryTransaction_productionBatchId_fkey" FOREIGN KEY ("productionBatchId") REFERENCES "ProductionBatch" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
