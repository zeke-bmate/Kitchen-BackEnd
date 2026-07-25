/*
  Warnings:

  - You are about to drop the column `itemName` on the `Purchase` table. All the data in the column will be lost.
  - You are about to drop the column `orderUnits` on the `Purchase` table. All the data in the column will be lost.
  - You are about to drop the column `pricePerKg` on the `Purchase` table. All the data in the column will be lost.
  - You are about to drop the column `weightKg` on the `Purchase` table. All the data in the column will be lost.

*/
-- CreateTable
CREATE TABLE "PurchaseItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "purchaseId" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "orderUnits" TEXT NOT NULL,
    "weightKg" REAL NOT NULL,
    "pricePerKg" REAL NOT NULL,
    "totalPrice" REAL NOT NULL,
    CONSTRAINT "PurchaseItem_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Purchase" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" DATETIME NOT NULL,
    "totalPrice" REAL NOT NULL,
    "supplierId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Purchase_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Purchase" ("createdAt", "date", "id", "supplierId", "totalPrice") SELECT "createdAt", "date", "id", "supplierId", "totalPrice" FROM "Purchase";
DROP TABLE "Purchase";
ALTER TABLE "new_Purchase" RENAME TO "Purchase";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
