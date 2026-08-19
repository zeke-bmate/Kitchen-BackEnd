-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_Purchase" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" DATETIME NOT NULL,
    "subtotal" REAL NOT NULL DEFAULT 0,
    "taxRate" REAL NOT NULL DEFAULT 0,
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
    "taxRate",
    "taxAmount",
    "supplierId",
    "totalPrice"
)
SELECT
    "createdAt",
    "date",
    "id",
    "totalPrice",
    0,
    0,
    "supplierId",
    "totalPrice"
FROM "Purchase";

DROP TABLE "Purchase";
ALTER TABLE "new_Purchase" RENAME TO "Purchase";

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;