PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

-- Rebuild PurchaseItem first while the old Purchase.taxRate
-- column is still available.

CREATE TABLE "new_PurchaseItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "purchaseId" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "orderUnits" TEXT,
    "quantity" REAL NOT NULL,
    "pricePerUnit" REAL NOT NULL,
    "subtotal" REAL NOT NULL,
    "taxRate" REAL NOT NULL DEFAULT 0,
    "taxAmount" REAL NOT NULL DEFAULT 0,
    "totalPrice" REAL NOT NULL,
    "rawIngredientId" TEXT,
    "supplyItemId" TEXT,

    CONSTRAINT "PurchaseItem_purchaseId_fkey"
      FOREIGN KEY ("purchaseId")
      REFERENCES "Purchase" ("id")
      ON DELETE RESTRICT
      ON UPDATE CASCADE,

    CONSTRAINT "PurchaseItem_rawIngredientId_fkey"
      FOREIGN KEY ("rawIngredientId")
      REFERENCES "RawIngredient" ("id")
      ON DELETE SET NULL
      ON UPDATE CASCADE,

    CONSTRAINT "PurchaseItem_supplyItemId_fkey"
      FOREIGN KEY ("supplyItemId")
      REFERENCES "SupplyItem" ("id")
      ON DELETE SET NULL
      ON UPDATE CASCADE
);

INSERT INTO "new_PurchaseItem" (
    "id",
    "purchaseId",
    "itemName",
    "orderUnits",
    "quantity",
    "pricePerUnit",
    "subtotal",
    "taxRate",
    "taxAmount",
    "totalPrice",
    "rawIngredientId",
    "supplyItemId"
)
SELECT
    pi."id",
    pi."purchaseId",
    pi."itemName",
    pi."orderUnits",
    pi."quantity",
    pi."pricePerUnit",

    -- Old PurchaseItem.totalPrice was the pre-tax line amount
    pi."totalPrice" AS "subtotal",

    -- Copy the old purchase-level tax rate onto each item
    p."taxRate" AS "taxRate",

    -- Calculate historical item tax
    ROUND(
      pi."totalPrice" * (p."taxRate" / 100.0),
      2
    ) AS "taxAmount",

    -- New PurchaseItem.totalPrice includes tax
    ROUND(
      pi."totalPrice" +
      (
        pi."totalPrice" * (p."taxRate" / 100.0)
      ),
      2
    ) AS "totalPrice",

    pi."rawIngredientId",
    pi."supplyItemId"

FROM "PurchaseItem" pi
JOIN "Purchase" p
  ON p."id" = pi."purchaseId";

DROP TABLE "PurchaseItem";

ALTER TABLE "new_PurchaseItem"
RENAME TO "PurchaseItem";


-- Now Purchase.taxRate can safely be removed.

CREATE TABLE "new_Purchase" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" DATETIME NOT NULL,
    "subtotal" REAL NOT NULL DEFAULT 0,
    "taxAmount" REAL NOT NULL DEFAULT 0,
    "totalPrice" REAL NOT NULL,
    "supplierId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Purchase_supplierId_fkey"
      FOREIGN KEY ("supplierId")
      REFERENCES "Supplier" ("id")
      ON DELETE RESTRICT
      ON UPDATE CASCADE
);

INSERT INTO "new_Purchase" (
    "createdAt",
    "date",
    "id",
    "subtotal",
    "supplierId",
    "taxAmount",
    "totalPrice"
)
SELECT
    "createdAt",
    "date",
    "id",
    "subtotal",
    "supplierId",
    "taxAmount",
    "totalPrice"
FROM "Purchase";

DROP TABLE "Purchase";

ALTER TABLE "new_Purchase"
RENAME TO "Purchase";

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;