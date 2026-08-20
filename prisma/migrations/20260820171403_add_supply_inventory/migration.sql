-- CreateTable
CREATE TABLE "SupplyItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "currentQuantity" REAL NOT NULL,
    "canonicalUnit" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_InventoryTransaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "rawIngredientId" TEXT,
    "supplyItemId" TEXT,
    "type" TEXT NOT NULL,
    "quantityChange" REAL NOT NULL,
    "previousQuantity" REAL NOT NULL,
    "newQuantity" REAL NOT NULL,
    "reason" TEXT,
    "purchaseId" TEXT,
    "productionBatchId" TEXT,
    "inventoryTransferId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InventoryTransaction_rawIngredientId_fkey" FOREIGN KEY ("rawIngredientId") REFERENCES "RawIngredient" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "InventoryTransaction_supplyItemId_fkey" FOREIGN KEY ("supplyItemId") REFERENCES "SupplyItem" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "InventoryTransaction_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "InventoryTransaction_productionBatchId_fkey" FOREIGN KEY ("productionBatchId") REFERENCES "ProductionBatch" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "InventoryTransaction_inventoryTransferId_fkey" FOREIGN KEY ("inventoryTransferId") REFERENCES "InventoryTransfer" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_InventoryTransaction" ("createdAt", "id", "inventoryTransferId", "newQuantity", "previousQuantity", "productionBatchId", "purchaseId", "quantityChange", "rawIngredientId", "reason", "type") SELECT "createdAt", "id", "inventoryTransferId", "newQuantity", "previousQuantity", "productionBatchId", "purchaseId", "quantityChange", "rawIngredientId", "reason", "type" FROM "InventoryTransaction";
DROP TABLE "InventoryTransaction";
ALTER TABLE "new_InventoryTransaction" RENAME TO "InventoryTransaction";
CREATE TABLE "new_PurchaseItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "purchaseId" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "orderUnits" TEXT,
    "quantity" REAL NOT NULL,
    "pricePerUnit" REAL NOT NULL,
    "totalPrice" REAL NOT NULL,
    "rawIngredientId" TEXT,
    "supplyItemId" TEXT,
    CONSTRAINT "PurchaseItem_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PurchaseItem_rawIngredientId_fkey" FOREIGN KEY ("rawIngredientId") REFERENCES "RawIngredient" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "PurchaseItem_supplyItemId_fkey" FOREIGN KEY ("supplyItemId") REFERENCES "SupplyItem" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_PurchaseItem" ("id", "itemName", "orderUnits", "pricePerUnit", "purchaseId", "quantity", "rawIngredientId", "totalPrice") SELECT "id", "itemName", "orderUnits", "pricePerUnit", "purchaseId", "quantity", "rawIngredientId", "totalPrice" FROM "PurchaseItem";
DROP TABLE "PurchaseItem";
ALTER TABLE "new_PurchaseItem" RENAME TO "PurchaseItem";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "SupplyItem_name_key" ON "SupplyItem"("name");
