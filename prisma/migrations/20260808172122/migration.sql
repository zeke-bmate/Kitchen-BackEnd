-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_PurchaseItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "purchaseId" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "orderUnits" TEXT,
    "weightKg" REAL NOT NULL,
    "pricePerKg" REAL NOT NULL,
    "totalPrice" REAL NOT NULL,
    "rawIngredientId" TEXT,
    CONSTRAINT "PurchaseItem_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PurchaseItem_rawIngredientId_fkey" FOREIGN KEY ("rawIngredientId") REFERENCES "RawIngredient" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_PurchaseItem" ("id", "itemName", "orderUnits", "pricePerKg", "purchaseId", "rawIngredientId", "totalPrice", "weightKg") SELECT "id", "itemName", "orderUnits", "pricePerKg", "purchaseId", "rawIngredientId", "totalPrice", "weightKg" FROM "PurchaseItem";
DROP TABLE "PurchaseItem";
ALTER TABLE "new_PurchaseItem" RENAME TO "PurchaseItem";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
