-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_InventoryTransaction" (
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
INSERT INTO "new_InventoryTransaction" ("createdAt", "id", "newWeightKg", "previousWeightKg", "productionBatchId", "purchaseId", "quantityChangeKg", "rawIngredientId", "reason", "type") SELECT "createdAt", "id", "newWeightKg", "previousWeightKg", "productionBatchId", "purchaseId", "quantityChangeKg", "rawIngredientId", "reason", "type" FROM "InventoryTransaction";
DROP TABLE "InventoryTransaction";
ALTER TABLE "new_InventoryTransaction" RENAME TO "InventoryTransaction";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
