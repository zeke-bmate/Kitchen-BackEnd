import express from "express";
import cors from "cors";
import { prisma } from "./prisma.js";
import multer from "multer";
import { parse } from "csv-parse/sync"
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { OrderStatus } from "@prisma/client";
import { MeasurementUnit } from "@prisma/client";

const app = express();

const upload = multer({
    storage: multer.memoryStorage(),
})

type JwtPayload = {
  userId: number;
  role: string;
};

// Seed mock user password (password is "secure123")
//mockUser.passwordHash = bcrypt.hashSync("secure123", 10);

// --- MIDDLEWARE: Protect Routes ---
const verifyToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Expects "Bearer <token>"

  if (!token) {
    return res.status(401).json({ message: "Access denied. No token provided." });
  }

  try {
    const verified = jwt.verify(
      token,
      process.env.JWT_SECRET!,
    ) as JwtPayload;
    req.user = verified; // Adds user data (id) to the request object
    next();
  } catch (error) {
    res.status(401).json({ message: "Invalid or expired token." });
  }
};

const requireRole = (...allowedRoles: string[]) => {
  return (req, res, next) => {
    const userRole = req.user?.role;

    if (!userRole) {
      return res.status(403).json({
        message: "Access denied. User role not found.",
      });
    }

    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({
        message: "Access denied. Insufficient permissions.",
      });
    }

    next();
  };
};

app.use(cors());
app.use(express.json());

app.post("/api/login", async (req, res) => {
  const { username, password } = req.body;

  const user = await prisma.user.findUnique({
    where: { username },
    include: {
        role: true,
    },
  });

  if (!user) {
    return res.status(400).json({
      message: "Invalid credentials.",
    });
  }

  const passwordMatches = await bcrypt.compare(
    password,
    user.passwordHash,
  );

  if (!passwordMatches) {
    return res.status(400).json({
      message: "Invalid credentials.",
    });
  }

  const token = jwt.sign(
    { userId: user.id,
      role: user.role.name,
     },
    process.env.JWT_SECRET,
    { expiresIn: "15min" },
  );

  return res.json({ token });
});

app.get("/api/users", verifyToken, requireRole("Admin"), async (req, res) => {
    try {
        const users = await prisma.user.findMany({
            orderBy: { name: "asc" },
            select: {
                id: true,
                name: true,
                createdAt: true,
                username: true,
                role: {
                    select: {
                        id: true,
                        name: true,
                    },
                },
            },
        });

        return res.json(users);
    } catch (error) {
        console.error(error);

        return res.status(500).json({
            error: "Failed to retrieve users.",
        });
    }
});

app.post("/api/users", verifyToken, requireRole("Admin"), async (req, res) => {

    try {
        const { username, password, name, roleId } = req.body;

        if (!isNonEmptyString(username)) {
            return res.status(422).json({
                error: "Username must be of type String and non-empty"
            });
        }
        if (!isNonEmptyString(password)) {
            return res.status(422).json({
                error: "Password must be of type String and non-empty"
            });
        }
        if (!isNonEmptyString(name)) {
            return res.status(422).json({
                error: "Name must be of type String and non-empty"
            });
        }
        if (!isPositiveNumber(roleId)) {
            return res.status(422).json({
                error: "Role Id must be a positive number greater than zero"
            });
        }

        const existingUser = await prisma.user.findUnique({
            where: { username },
        });

        if (existingUser) {
             return res.status(409).json({
              error: "Username already exists.",
            });
        }

        const role = await prisma.role.findUnique({
            where: { id: roleId },
        });

        if (!role) {
            return res.status(404).json({
              error: "Role not found.",
            });
        }

        const passwordHash = await bcrypt.hash(password, 10);

        const createdUser = await prisma.user.create({
            data: { name, passwordHash, username, roleId },
            select: {
                id: true,
                username: true,
                name: true,
                createdAt: true,
                role: {
                    select: {
                        id: true,
                        name: true,
                    },
                },
            }
        });

        return res.status(201).json(createdUser);
    } catch (error) {
        console.error(error);

        return res.status(500).json({
            error: "Failed to create user.",
        });
    }
}); 

app.get("/api/roles", verifyToken, requireRole("Admin"),  async (req, res) => {
    try {
        const roles = await prisma.role.findMany({
            orderBy: { id: "asc"},
        });

        return res.json(roles);
    } catch (error) {
        console.error(error);

        res.status(500).json({
            error: "Failed to retrieve roles.",
        });
    }
});

app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
});

app.get("/api/suppliers", verifyToken, requireRole("Admin", "Echo"), async (req, res) => {
    const suppliers = await prisma.supplier.findMany({
        orderBy: { createdAt: "desc"}
    });
    res.json(suppliers);
});

app.get(
  "/api/suppliers/:id/purchases",
  verifyToken,
  requireRole("Admin", "Echo"),
  async (req, res) => {
    try {
      const supplierId = req.params.id;

      if (!isNonEmptyString(supplierId)) {
        return res.status(422).json({
          error: "Supplier ID must be a non-empty string.",
        });
      }

      const supplier = await prisma.supplier.findUnique({
        where: {
          id: supplierId,
        },
      });

      if (!supplier) {
        return res.status(404).json({
          error: "Supplier not found.",
        });
      }

      const purchases = await prisma.purchase.findMany({
        where: {
          supplierId,
        },
        orderBy: {
          date: "desc",
        },
        include: {
          supplier: true,
          items: {
            include: {
              rawIngredient: true,
              supplyItem: true,
            },
          },
        },
      });

      return res.status(200).json({
        supplier,
        purchases,
      });
    } catch (error) {
      console.error(error);

      return res.status(500).json({
        error: "Failed to load supplier purchase history.",
      });
    }
  },
);

app.post("/api/suppliers", verifyToken, requireRole("Admin", "Echo"), async (req, res) => {
    const name = req.body.name;
    if (typeof name !== 'string') {
        res.status(422).send("Name of supplier is not of type string");
        return;
    }

    const trimmedName = name.trim();
    if (!trimmedName) {
        res.status(400).send("Supplier name is required");
        return;
    }

    const existingName = await prisma.supplier.findFirst({
        where: { name: trimmedName },
    });

    if (existingName) {
        res.status(422).send("Name of supplier exists already");
        return;
    }

    const supplier = await prisma.supplier.create({
        data: { name: trimmedName }
    })
    res.status(201).json(supplier);
});

app.get(
  "/api/purchases",
  verifyToken,
  requireRole("Admin", "Echo"),
  async (req, res) => {
    const purchases = await prisma.purchase.findMany({
      include: {
        supplier: true,
        items: {
          include: {
            rawIngredient: true,
            supplyItem: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    res.json(purchases);
  },
);

app.post(
  "/api/purchases",
  verifyToken,
  requireRole("Admin", "Echo"),
  async (req, res) => {
    try {
      const items = req.body.items;
      const date = req.body.date;
      const supplierId = req.body.supplierId;
      const taxRate = req.body.taxRate;

      if (!Array.isArray(items) || items.length === 0) {
        return res.status(422).json({
          error: "Items must be a non-empty array.",
        });
      }

      if (!isValidDate(date)) {
        return res.status(422).json({
          error: "Date must be a valid string.",
        });
      }

      if (!isNonEmptyString(supplierId)) {
        return res.status(422).json({
          error: "Supplier ID must be a non-empty string.",
        });
      }

      const taxRateNum = taxRate === undefined || taxRate === null || taxRate === ""   ? 0   : Number(taxRate);

      if (
        Number.isNaN(taxRateNum) ||
        taxRateNum < 0 ||
        taxRateNum > 100
      ) {
        return res.status(422).json({
          error: "Tax rate must be between 0 and 100.",
        });
      }

      const existingSupplier = await prisma.supplier.findUnique({
        where: { id: supplierId },
      });

      if (!existingSupplier) {
        return res.status(404).json({
          error: "Supplier does not exist.",
        });
      }

      const validUnits = Object.values(MeasurementUnit);

      const validatedItems: {
        orderUnits: string | null;
        quantity: number;
        pricePerUnit: number;
        totalPrice: number;

        rawIngredientId?: string;
        newIngredientName?: string;

        supplyItemId?: string;
        newSupplyItemName?: string;

        canonicalUnit?: MeasurementUnit;
      }[] = [];

      let purchaseSubtotal = 0;

      for (const item of items) {
        const orderUnits = item.orderUnits;
        const quantity = item.quantity;
        const totalPrice = item.totalPrice;

        const rawIngredientId = item.rawIngredientId;
        const newIngredientName = item.newIngredientName;

        const supplyItemId = item.supplyItemId;
        const newSupplyItemName = item.newSupplyItemName;

        const canonicalUnit = item.canonicalUnit;

        const hasExistingIngredient =
          isNonEmptyString(rawIngredientId);

        const hasNewIngredient =
          isNonEmptyString(newIngredientName);

        const hasExistingSupplyItem =
          isNonEmptyString(supplyItemId);

        const hasNewSupplyItem =
          isNonEmptyString(newSupplyItemName);

        const itemTypeCount = [
          hasExistingIngredient,
          hasNewIngredient,
          hasExistingSupplyItem,
          hasNewSupplyItem,
        ].filter(Boolean).length;

        if (itemTypeCount !== 1) {
          return res.status(422).json({
            error:
              "Each purchase item must reference exactly one existing or new inventory item.",
          });
        }

        if (
          (hasNewIngredient || hasNewSupplyItem) &&
          (
            !isNonEmptyString(canonicalUnit) ||
            !validUnits.includes(canonicalUnit as MeasurementUnit)
          )
        ) {
          return res.status(422).json({
            error:
              "A valid canonical unit is required for new inventory items.",
          });
        }

        if (!isPositiveNumber(quantity)) {
          return res.status(422).json({
            error: "Quantity must be greater than zero.",
          });
        }

        if (!isPositiveNumber(totalPrice)) {
          return res.status(422).json({
            error: "Total price must be greater than zero.",
          });
        }

        const pricePerUnit = Math.round((totalPrice / quantity) * 100) / 100;

        validatedItems.push({
          orderUnits:
            typeof orderUnits === "string" && orderUnits.trim()
              ? orderUnits.trim()
              : null,

          quantity,
          pricePerUnit,
          totalPrice,

          ...(hasExistingIngredient && {
            rawIngredientId,
          }),
        
          ...(hasNewIngredient && {
            newIngredientName:
              normalizeInventoryItemName(newIngredientName),
            canonicalUnit: canonicalUnit as MeasurementUnit,
          }),
        
          ...(hasExistingSupplyItem && {
            supplyItemId,
          }),
        
          ...(hasNewSupplyItem && {
            newSupplyItemName:
              normalizeInventoryItemName(newSupplyItemName),
            canonicalUnit: canonicalUnit as MeasurementUnit,
          }),
        });

        purchaseSubtotal += totalPrice;
      }

      const subtotal = Math.round(purchaseSubtotal * 100) / 100;
      const taxAmount = Math.round(subtotal * (taxRateNum / 100) * 100) / 100;
      const purchaseTotal = Math.round((subtotal + taxAmount) * 100) / 100;

      const result = await prisma.$transaction(async (tx) => {
        const resolvedItems: {
          itemName: string;
          orderUnits: string | null;
          quantity: number;
          pricePerUnit: number;
          totalPrice: number;

          rawIngredientId?: string;
          supplyItemId?: string;

          previousQuantity: number;
          newQuantity: number;
        }[] = [];

        for (const item of validatedItems) {
          let itemName: string;
          let rawIngredientId: string | undefined;
          let supplyItemId: string | undefined;
          let previousQuantity: number;
          let newQuantity: number;

          if (item.rawIngredientId) {
            const rawIngredient = await tx.rawIngredient.findUnique({
              where: {
                id: item.rawIngredientId,
              },
            });
          
            if (!rawIngredient) {
              throw new Error("RAW_INGREDIENT_NOT_FOUND");
            }
          
            previousQuantity = rawIngredient.currentQuantity;
          
            const updatedIngredient = await tx.rawIngredient.update({
              where: {
                id: rawIngredient.id,
              },
              data: {
                currentQuantity: {
                  increment: item.quantity,
                },
              },
            });
          
            itemName = rawIngredient.name;
            rawIngredientId = rawIngredient.id;
            newQuantity = updatedIngredient.currentQuantity;
          } else if (item.newIngredientName) {
            const normalizedName = item.newIngredientName;
          
            const existingIngredient =
              await tx.rawIngredient.findUnique({
                where: {
                  name: normalizedName,
                },
              });
            
            if (existingIngredient) {
              throw new Error(
                `DUPLICATE_INGREDIENT:${normalizedName}`,
              );
            }
          
            if (!item.canonicalUnit) {
              throw new Error("CANONICAL_UNIT_REQUIRED");
            }
          
            const rawIngredient = await tx.rawIngredient.create({
              data: {
                name: normalizedName,
                currentQuantity: item.quantity,
                canonicalUnit: item.canonicalUnit,
              },
            });
          
            itemName = rawIngredient.name;
            rawIngredientId = rawIngredient.id;
            previousQuantity = 0;
            newQuantity = rawIngredient.currentQuantity;
          } else if (item.supplyItemId) {
            const supplyItem = await tx.supplyItem.findUnique({
              where: {
                id: item.supplyItemId,
              },
            });
          
            if (!supplyItem) {
              throw new Error("SUPPLY_ITEM_NOT_FOUND");
            }
          
            previousQuantity = supplyItem.currentQuantity;
          
            const updatedSupplyItem = await tx.supplyItem.update({
              where: {
                id: supplyItem.id,
              },
              data: {
                currentQuantity: {
                  increment: item.quantity,
                },
              },
            });
          
            itemName = supplyItem.name;
            supplyItemId = supplyItem.id;
            newQuantity = updatedSupplyItem.currentQuantity;
          } else if (item.newSupplyItemName) {
            const normalizedName = item.newSupplyItemName;
          
            const existingSupplyItem =
              await tx.supplyItem.findUnique({
                where: {
                  name: normalizedName,
                },
              });
            
            if (existingSupplyItem) {
              throw new Error(
                `DUPLICATE_SUPPLY_ITEM:${normalizedName}`,
              );
            }
          
            if (!item.canonicalUnit) {
              throw new Error("CANONICAL_UNIT_REQUIRED");
            }
          
            const supplyItem = await tx.supplyItem.create({
              data: {
                name: normalizedName,
                currentQuantity: item.quantity,
                canonicalUnit: item.canonicalUnit,
              },
            });
          
            itemName = supplyItem.name;
            supplyItemId = supplyItem.id;
            previousQuantity = 0;
            newQuantity = supplyItem.currentQuantity;
          } else {
            throw new Error("INVALID_PURCHASE_ITEM");
          }
        
          resolvedItems.push({
            itemName,
            orderUnits: item.orderUnits,
            quantity: item.quantity,
            pricePerUnit: item.pricePerUnit,
            totalPrice: item.totalPrice,
          
            ...(rawIngredientId && {
              rawIngredientId,
            }),
          
            ...(supplyItemId && {
              supplyItemId,
            }),
          
            previousQuantity,
            newQuantity,
          });
        }

        const purchase = await tx.purchase.create({
          data: {
            date: new Date(`${date}T12:00:00`),
            supplierId,
            subtotal,
            taxRate: taxRateNum,
            taxAmount,
            totalPrice: purchaseTotal,
            items: {
              create: resolvedItems.map((item) => ({
                itemName: item.itemName,
                orderUnits: item.orderUnits,

                quantity: item.quantity,
                pricePerUnit: item.pricePerUnit,

                totalPrice: item.totalPrice,
                rawIngredientId: item.rawIngredientId ?? null,
                supplyItemId: item.supplyItemId ?? null,
              })),
            },
          },
          include: {
            supplier: true,
            items: {
              include: {
                rawIngredient: true,
                supplyItem: true,
              },
            },
          },
        });

        for (const item of resolvedItems) {
          await tx.inventoryTransaction.create({
            data: {
              rawIngredientId: item.rawIngredientId ?? null,
              supplyItemId: item.supplyItemId ?? null,
              type: "PURCHASE",
              quantityChange: item.quantity,
              previousQuantity: item.previousQuantity,
              newQuantity: item.newQuantity,
              purchaseId: purchase.id,
            },
          });
        }

        return purchase;
      });

      return res.status(201).json(result);
    } catch (error) {
      console.error(error);

      if (
        error instanceof Error &&
        error.message === "RAW_INGREDIENT_NOT_FOUND"
      ) {
        return res.status(404).json({
          error: "Raw ingredient not found.",
        });
      }

      if (
        error instanceof Error &&
        error.message.startsWith("DUPLICATE_INGREDIENT:")
      ) {
        const ingredientName = error.message.split(":")[1];

        return res.status(409).json({
          error: `Ingredient "${ingredientName}" already exists. Select the existing ingredient instead.`,
        });
      }

      if (
        error instanceof Error &&
        error.message === "CANONICAL_UNIT_REQUIRED"
      ) {
        return res.status(422).json({
          error: "A canonical unit is required for new inventory items.",
        });
      }

      if (
        error instanceof Error &&
        error.message === "SUPPLY_ITEM_NOT_FOUND"
      ) {
        return res.status(404).json({
          error: "Supply item not found.",
        });
      }

      if (
        error instanceof Error &&
        error.message.startsWith("DUPLICATE_SUPPLY_ITEM:")
      ) {
        const supplyItemName = error.message.split(":")[1];
      
        return res.status(409).json({
          error: `Supply item "${supplyItemName}" already exists. Select the existing supply item instead.`,
        });
      }

      return res.status(500).json({
        error: "Failed to create purchase.",
      });
    }
  },
);

app.patch(
  "/api/purchases/:id",
  verifyToken,
  requireRole("Admin", "Echo"),
  async (req, res) => {
    try {
      const purchaseId = req.params.id;

      if (!isNonEmptyString(purchaseId)) {
        return res.status(422).json({
          error: "Purchase ID must be a non-empty string.",
        });
      }

      const {
        purchase,
        locked,
      } = await getPurchaseEditLock(purchaseId);

      if (!purchase) {
        return res.status(404).json({
          error: "Purchase not found.",
        });
      }

      if (locked) {
        return res.status(409).json({
          error:
            "Purchase cannot be edited because its inventory has already had later activity.",
        });
      }

      const items = req.body.items;
      const date = req.body.date;
      const supplierId = req.body.supplierId;
      const reason = req.body.reason;
      const taxRate = req.body.taxRate;

      if (!Array.isArray(items) || items.length === 0) {
        return res.status(422).json({
          error: "Items must be a non-empty array.",
        });
      }
      
      if (!isValidDate(date)) {
        return res.status(422).json({
          error: "Date must be a valid string.",
        });
      }
      
      if (!isNonEmptyString(supplierId)) {
        return res.status(422).json({
          error: "Supplier ID must be a non-empty string.",
        });
      }
      
      if (!isNonEmptyString(reason)) {
        return res.status(422).json({
          error: "Correction reason must be a non-empty string.",
        });
      }

      const taxRateNum = taxRate === undefined || taxRate === null || taxRate === ""   ? 0   : Number(taxRate);

      if (
        Number.isNaN(taxRateNum) ||
        taxRateNum < 0 ||
        taxRateNum > 100
      ) {
        return res.status(422).json({
          error: "Tax rate must be between 0 and 100.",
        });
      }

      const existingSupplier = await prisma.supplier.findUnique({
        where: {
          id: supplierId,
        },
      });
      
      if (!existingSupplier) {
        return res.status(404).json({
          error: "Supplier does not exist.",
        });
      }

      const validUnits = Object.values(MeasurementUnit);

      const validatedItems: {
        rawIngredientId?: string;
        newIngredientName?: string;
        supplyItemId?: string;
        newSupplyItemName?: string;
        canonicalUnit?: MeasurementUnit;
        orderUnits: string | null;
        quantity: number;
        pricePerUnit: number;
        totalPrice: number;
      }[] = [];

      let purchaseSubtotal = 0;
      
      for (const item of items) {
        const rawIngredientId = item.rawIngredientId;
        const newIngredientName = item.newIngredientName;

        const supplyItemId = item.supplyItemId;
        const newSupplyItemName = item.newSupplyItemName;

        const canonicalUnit = item.canonicalUnit;
        const orderUnits = item.orderUnits;
        const quantity = item.quantity;
        const totalPrice = item.totalPrice;

        const hasExistingIngredient =
          isNonEmptyString(rawIngredientId);

        const hasNewIngredient =
          isNonEmptyString(newIngredientName);

        const hasExistingSupplyItem =
          isNonEmptyString(supplyItemId);

        const hasNewSupplyItem =
          isNonEmptyString(newSupplyItemName);

        const itemTypeCount = [
          hasExistingIngredient,
          hasNewIngredient,
          hasExistingSupplyItem,
          hasNewSupplyItem,
        ].filter(Boolean).length;

        if (itemTypeCount !== 1) {
          return res.status(422).json({
            error:
              "Each item must reference exactly one existing or new inventory item.",
          });
        }

        if (
          (hasNewIngredient || hasNewSupplyItem) &&
          (
            !isNonEmptyString(canonicalUnit) ||
            !validUnits.includes(
              canonicalUnit as MeasurementUnit
            )
          )
        ) {
          return res.status(422).json({
            error:
              "A valid canonical unit is required for new inventory items.",
          });
        }
    
        if (!isPositiveNumber(quantity)) {
          return res.status(422).json({
            error: "Quantity must be greater than zero.",
          });
        }
    
        if (!isPositiveNumber(totalPrice)) {
          return res.status(422).json({
            error: "Total price must be greater than zero.",
          });
        }
    
        if (hasExistingIngredient) {
          const rawIngredient =
            await prisma.rawIngredient.findUnique({
              where: {
                id: rawIngredientId,
              },
            });
          
          if (!rawIngredient) {
            return res.status(404).json({
              error: "Raw ingredient not found.",
            });
          }
        }

        if (hasExistingSupplyItem) {
          const supplyItem =
            await prisma.supplyItem.findUnique({
              where: {
                id: supplyItemId,
              },
            });
          
          if (!supplyItem) {
            return res.status(404).json({
              error: "Supply item not found.",
            });
          }
        }
    
        const pricePerUnit =
          Math.round((totalPrice / quantity) * 100) / 100;
    
        validatedItems.push({
          ...(hasExistingIngredient && {
            rawIngredientId,
          }),
        
          ...(hasNewIngredient && {
            newIngredientName:
              normalizeInventoryItemName(newIngredientName),
            canonicalUnit:
              canonicalUnit as MeasurementUnit,
          }),
        
          ...(hasExistingSupplyItem && {
            supplyItemId,
          }),
        
          ...(hasNewSupplyItem && {
            newSupplyItemName:
              normalizeInventoryItemName(newSupplyItemName),
            canonicalUnit:
              canonicalUnit as MeasurementUnit,
          }),
        
          orderUnits:
            typeof orderUnits === "string" &&
            orderUnits.trim()
              ? orderUnits.trim()
              : null,
        
          quantity,
          pricePerUnit,
          totalPrice,
        });
    
        purchaseSubtotal += totalPrice;
      }

      const subtotal = Math.round(purchaseSubtotal * 100) / 100;
        
      const taxAmount = Math.round(subtotal * (taxRateNum / 100) * 100) / 100;
    
      const purchaseTotal = Math.round((subtotal + taxAmount) * 100) / 100;

      const inventoryItemKeys = validatedItems.map(
        (item) => {
          if (item.rawIngredientId) {
            return `raw:${item.rawIngredientId}`;
          }
        
          if (item.newIngredientName) {
            return `raw-name:${item.newIngredientName}`;
          }
        
          if (item.supplyItemId) {
            return `supply:${item.supplyItemId}`;
          }
        
          return `supply-name:${item.newSupplyItemName}`;
        }
      );

      if (
        new Set(inventoryItemKeys).size !==
        inventoryItemKeys.length
      ) {
        return res.status(422).json({
          error:
            "The same inventory item cannot appear more than once in a purchase.",
        });
      }

      const result = await prisma.$transaction(async (tx) => {
      const existingPurchase = await tx.purchase.findUnique({
        where: {
          id: purchaseId,
        },
        include: {
          items: true,
        },
      });

      if (!existingPurchase) {
        throw new Error("PURCHASE_NOT_FOUND");
      }

      // Reverse original purchase inventory effects
      for (const item of existingPurchase.items) {
        const hasRawIngredient = !!item.rawIngredientId;
        const hasSupplyItem = !!item.supplyItemId;
      
        if (hasRawIngredient === hasSupplyItem) {
          throw new Error("PURCHASE_ITEM_NOT_LINKED");
        }
      
        if (item.rawIngredientId) {
          const rawIngredient = await tx.rawIngredient.findUnique({
            where: {
              id: item.rawIngredientId,
            },
          });
        
          if (!rawIngredient) {
            throw new Error("RAW_INGREDIENT_NOT_FOUND");
          }
        
          if (rawIngredient.currentQuantity < item.quantity) {
            throw new Error(
              `INSUFFICIENT_INVENTORY_TO_REVERSE:${rawIngredient.name}`,
            );
          }
        
          await tx.rawIngredient.update({
            where: {
              id: rawIngredient.id,
            },
            data: {
              currentQuantity: {
                decrement: item.quantity,
              },
            },
          });
        } else if (item.supplyItemId) {
          const supplyItem = await tx.supplyItem.findUnique({
            where: {
              id: item.supplyItemId,
            },
          });
        
          if (!supplyItem) {
            throw new Error("SUPPLY_ITEM_NOT_FOUND");
          }
        
          if (supplyItem.currentQuantity < item.quantity) {
            throw new Error(
              `INSUFFICIENT_INVENTORY_TO_REVERSE:${supplyItem.name}`,
            );
          }
        
          await tx.supplyItem.update({
            where: {
              id: supplyItem.id,
            },
            data: {
              currentQuantity: {
                decrement: item.quantity,
              },
            },
          });
        }
      }

      // Remove old purchase ledger entries
      await tx.inventoryTransaction.deleteMany({
        where: {
          purchaseId,
          type: "PURCHASE",
        },
      });

      // Remove old purchase items
      await tx.purchaseItem.deleteMany({
        where: {
          purchaseId,
        },
      });

      const resolvedItems: {
        itemName: string;
        orderUnits: string | null;
        quantity: number;
        pricePerUnit: number;
        totalPrice: number;
        rawIngredientId?: string;
        supplyItemId?: string;
        previousQuantity: number;
        newQuantity: number;
      }[] = [];

      // Apply corrected inventory
      for (const item of validatedItems) {
        let itemName: string;
        let rawIngredientId: string | undefined;
        let supplyItemId: string | undefined;
        let previousQuantity: number;
        let newQuantity: number;
      
        if (item.rawIngredientId) {
          const rawIngredient = await tx.rawIngredient.findUnique({
            where: {
              id: item.rawIngredientId,
            },
          });
        
          if (!rawIngredient) {
            throw new Error("RAW_INGREDIENT_NOT_FOUND");
          }
        
          previousQuantity = rawIngredient.currentQuantity;
        
          const updatedIngredient = await tx.rawIngredient.update({
            where: {
              id: rawIngredient.id,
            },
            data: {
              currentQuantity: {
                increment: item.quantity,
              },
            },
          });
        
          itemName = rawIngredient.name;
          rawIngredientId = rawIngredient.id;
          newQuantity = updatedIngredient.currentQuantity;
        } else if (item.newIngredientName) {
          const normalizedName =
            item.newIngredientName;

          const existingIngredient =
            await tx.rawIngredient.findUnique({
              where: {
                name: normalizedName,
              },
            });
          
          if (existingIngredient) {
            throw new Error(
              `DUPLICATE_INGREDIENT:${normalizedName}`
            );
          }
        
          if (!item.canonicalUnit) {
            throw new Error(
              "CANONICAL_UNIT_REQUIRED"
            );
          }
        
          const rawIngredient =
            await tx.rawIngredient.create({
              data: {
                name: normalizedName,
                currentQuantity: item.quantity,
                canonicalUnit: item.canonicalUnit,
              },
            });
          
          itemName = rawIngredient.name;
          rawIngredientId = rawIngredient.id;
          previousQuantity = 0;
          newQuantity =
            rawIngredient.currentQuantity;
        } else if (item.supplyItemId) {
          const supplyItem = await tx.supplyItem.findUnique({
            where: {
              id: item.supplyItemId,
            },
          });
        
          if (!supplyItem) {
            throw new Error("SUPPLY_ITEM_NOT_FOUND");
          }
        
          previousQuantity = supplyItem.currentQuantity;
        
          const updatedSupplyItem = await tx.supplyItem.update({
            where: {
              id: supplyItem.id,
            },
            data: {
              currentQuantity: {
                increment: item.quantity,
              },
            },
          });
        
          itemName = supplyItem.name;
          supplyItemId = supplyItem.id;
          newQuantity = updatedSupplyItem.currentQuantity;
        } else if (item.newSupplyItemName) {
          const normalizedName =
            item.newSupplyItemName;

          const existingSupplyItem =
            await tx.supplyItem.findUnique({
              where: {
                name: normalizedName,
              },
            });
          
          if (existingSupplyItem) {
            throw new Error(
              `DUPLICATE_SUPPLY_ITEM:${normalizedName}`
            );
          }
        
          if (!item.canonicalUnit) {
            throw new Error(
              "CANONICAL_UNIT_REQUIRED"
            );
          }
        
          const supplyItem =
            await tx.supplyItem.create({
              data: {
                name: normalizedName,
                currentQuantity: item.quantity,
                canonicalUnit: item.canonicalUnit,
              },
            });
          
          itemName = supplyItem.name;
          supplyItemId = supplyItem.id;
          previousQuantity = 0;
          newQuantity =
            supplyItem.currentQuantity;
        } else {
          throw new Error("PURCHASE_ITEM_NOT_LINKED");
        }
      
        resolvedItems.push({
          itemName,
          orderUnits: item.orderUnits,
          quantity: item.quantity,
          pricePerUnit: item.pricePerUnit,
          totalPrice: item.totalPrice,
        
          ...(rawIngredientId && {
            rawIngredientId,
          }),
        
          ...(supplyItemId && {
            supplyItemId,
          }),
        
          previousQuantity,
          newQuantity,
        });
      }

      const updatedPurchase = await tx.purchase.update({
        where: {
          id: purchaseId,
        },
        data: {
          date: new Date(`${date}T12:00:00`),
          supplierId,
          subtotal,
          taxRate: taxRateNum,
          taxAmount,
          totalPrice: purchaseTotal,
          items: {
            create: resolvedItems.map((item) => ({
              itemName: item.itemName,
              orderUnits: item.orderUnits,
              quantity: item.quantity,
              pricePerUnit: item.pricePerUnit,
              totalPrice: item.totalPrice,
              rawIngredientId: item.rawIngredientId ?? null,
              supplyItemId: item.supplyItemId ?? null,
            })),
          },
        },
        include: {
          supplier: true,
          items: {
            include: {
              rawIngredient: true,
              supplyItem: true,
            },
          },
        },
      });

      for (const item of resolvedItems) {
        await tx.inventoryTransaction.create({
          data: {
            rawIngredientId: item.rawIngredientId ?? null,
            supplyItemId: item.supplyItemId ?? null,
            type: "PURCHASE",
            quantityChange: item.quantity,
            previousQuantity: item.previousQuantity,
            newQuantity: item.newQuantity,
            purchaseId: updatedPurchase.id,
            reason: `Purchase correction: ${reason.trim()}`,
          },
        });
      }

      return updatedPurchase;
    });

    return res.status(200).json(result);

    } catch (error) {
      console.error(error);

      if (
        error instanceof Error &&
        error.message === "PURCHASE_NOT_FOUND"
      ) {
        return res.status(404).json({
          error: "Purchase not found.",
        });
      }

      if (
        error instanceof Error &&
        error.message === "PURCHASE_ITEM_NOT_LINKED"
      ) {
        return res.status(409).json({
          error:
            "Purchase cannot be edited because one or more original items are not linked to an inventory item.",
        });
      }
      
      if (
        error instanceof Error &&
        error.message === "RAW_INGREDIENT_NOT_FOUND"
      ) {
        return res.status(404).json({
          error: "Raw ingredient not found.",
        });
      }

      if (
        error instanceof Error &&
        error.message === "SUPPLY_ITEM_NOT_FOUND"
      ) {
        return res.status(404).json({
          error: "Supply item not found.",
        });
      }
      
      if (
        error instanceof Error &&
        error.message.startsWith(
          "INSUFFICIENT_INVENTORY_TO_REVERSE:",
        )
      ) {
        const ingredientName = error.message.split(":")[1];
      
        return res.status(409).json({
          error: `Purchase cannot be edited because inventory for ${ingredientName} has already been consumed or transferred.`,
        });
      }

      if (
        error instanceof Error &&
        error.message.startsWith(
          "DUPLICATE_INGREDIENT:"
        )
      ) {
        const ingredientName =
          error.message.split(":")[1];
      
        return res.status(409).json({
          error: `Ingredient "${ingredientName}" already exists. Select the existing ingredient instead.`,
        });
      }
      
      if (
        error instanceof Error &&
        error.message.startsWith(
          "DUPLICATE_SUPPLY_ITEM:"
        )
      ) {
        const supplyItemName =
          error.message.split(":")[1];
      
        return res.status(409).json({
          error: `Supply item "${supplyItemName}" already exists. Select the existing supply item instead.`,
        });
      }
      
      if (
        error instanceof Error &&
        error.message === "CANONICAL_UNIT_REQUIRED"
      ) {
        return res.status(422).json({
          error:
            "A canonical unit is required for new inventory items.",
        });
      }

      return res.status(500).json({
        error: "Failed to update purchase.",
      });
    }
  },
);

app.get("/api/raw-ingredients", verifyToken, requireRole("Admin", "Echo"), async (req, res) => {
    const ingredients = await prisma.rawIngredient.findMany({
        orderBy: { name: "asc"},
    });
    res.json(ingredients);
});

app.get(
  "/api/raw-ingredients/:id/transactions",
  verifyToken,
  requireRole("Admin", "Echo"),
  async (req, res) => {
    try {
      const ingredientId = req.params.id;

      const ingredient = await prisma.rawIngredient.findUnique({
        where: {
          id: ingredientId,
        },
      });

      if (!ingredient) {
        return res.status(404).json({
          error: "Ingredient not found.",
        });
      }

      const transactions = await prisma.inventoryTransaction.findMany({
          where: {
            rawIngredientId: ingredientId,
          },
          include: {
            purchase: {
              include: {
                supplier: true,
              },
            },
            productionBatch: {
              include: {
                recipe: true,
              },
            },
            inventoryTransfer: true,
          },
          orderBy: {
            createdAt: "desc",
          },
        });

      return res.status(200).json({
        ingredient,
        transactions,
      });
    } catch (error) {
      console.error(error);

      return res.status(500).json({
        error: "Failed to load inventory transactions.",
      });
    }
  },
);

app.post("/api/raw-ingredients", verifyToken, requireRole("Admin", "Echo"), async (req, res) => {
    const name = req.body.name;
    const currentQuantity = req.body.currentQuantity;
    const canonicalUnit = req.body.canonicalUnit;

    if (!isNonEmptyString(name)) {
        res.status(422).json({
            error: "Ingredient name must be of type String and non-empty"
        });
        return;
    }

    if (!isNonNegativeNumber(currentQuantity)) {
      return res.status(422).json({
        error: "Quantity must be a non-negative number.",
      });
    }

    const validUnits = ["KG", "L", "EACH", "BUNCH", "HEAD"];

    if (
      !isNonEmptyString(canonicalUnit) ||
      !validUnits.includes(canonicalUnit)
    ) {
      return res.status(422).json({
        error: "Canonical unit is invalid.",
      });
    }

    const trimmedName = normalizeInventoryItemName(name);
    const existingName = await prisma.rawIngredient.findUnique({
        where: { name: trimmedName },
    });

    if (existingName) {
        res.status(422).json({
            error: "Name of ingredient exists already"
        });
        return;
    }

    const ingredient = await prisma.rawIngredient.create({
        data: { 
            name: trimmedName,
            currentQuantity,
            canonicalUnit,
            }
    });

    return res.status(201).json(ingredient);
});

app.patch("/api/raw-ingredients/:id", verifyToken, requireRole("Admin", "Echo"), async (req,res) => {

    try {
        const currentQuantity = req.body.currentQuantity;

        if (!isNonNegativeNumber(currentQuantity)) {
          return res.status(422).json({
            error: "Quantity must be a non-negative number.",
          });
        }

        const ingredientId = req.params.id;

        const existingIngredient = await prisma.rawIngredient.findUnique({
            where : { id : ingredientId }
        });

        if (!existingIngredient) {
            return res.status(404).json({
                error: "Ingredient not found"
            });
        }

        const reason = req.body.reason;

        if (reason !== undefined && !isNonEmptyString(reason)) {
          return res.status(422).json({
            error: "Reason must be a non-empty string when provided.",
          });
        }

        const updatedIngredient = await prisma.$transaction(async (tx) => {
          const updated = await tx.rawIngredient.update({
            where: {
              id: ingredientId,
            },
            data: {
              currentQuantity,
            },
          });

          await tx.inventoryAdjustment.create({
            data: {
              rawIngredientId: ingredientId,
              previousQuantity: existingIngredient.currentQuantity,
              newQuantity: currentQuantity,
              reason: reason?.trim() || null,
            },
          });

          await tx.inventoryTransaction.create({
            data: {
              rawIngredientId: ingredientId,
              type: "ADJUSTMENT",
              quantityChange:
                currentQuantity - existingIngredient.currentQuantity,
              previousQuantity: existingIngredient.currentQuantity,
              newQuantity: currentQuantity,
              reason: reason?.trim() || null,
            },
          });

          return updated;
        });

        return res.status(200).json(updatedIngredient);
    } catch (error) {
        console.error(error);

        return res.status(500).json({
            error: "Failed to update ingredient.",
        });
    }
});

app.get("/api/recipes", verifyToken, requireRole("Admin", "DeePlace", "Echo"), async (req, res) => {
    const recipes = await prisma.recipe.findMany({
        include: { 
            ingredients: { 
                include: { rawIngredient: true }
            }
        },
        orderBy: { name: "asc"},
    });
    res.json(recipes);
});

app.post("/api/recipes", verifyToken, requireRole("Admin", "Echo"), async (req, res) => {
    const name = req.body.name;

    if (!isNonEmptyString(name)) {
        res.status(422).json({
            error: "Recipe name must be of type String and non-empty"
        });
        return;
    }

    const servings = req.body.servings;

    if (!isPositiveNumber(servings)) {
        res.status(422).json({
            error: "Servings must be a positive number greater than zero"
        });
        return;
    }

    const ingredientsArray = req.body.ingredients;

    if (!ingredientsArray?.length) {
        res.status(422).json({
            error: "Ingredients Array must exist and non-empty"
        });
        return;
    }

    let ingredientsIdArray = [];

    for (const ingredient of ingredientsArray) {
        const quantity = ingredient.quantity;

        if (!isPositiveNumber(quantity)) {
            return res.status(422).json({
                error: "Quantity must be a positive number greater than zero",
            });
        }

        const ingredientId = ingredient.rawIngredientId;

        if (!isNonEmptyString(ingredientId)) {
            return res.status(422).json({
                error: "Raw Ingredient ID must be of type String and non-empty",
            });
        }

        ingredientsIdArray.push(ingredientId);
    }

    const ingredientsIdSet = new Set(ingredientsIdArray);

    if (ingredientsIdArray.length !== ingredientsIdSet.size) {
        res.status(422).json({
            error: "Raw Ingredient Array must not contain any duplicates"
        });
        return;
    }

    const existingIngredients = await prisma.rawIngredient.findMany({
        where: {
            id: {
                in: ingredientsIdArray
            }
        }
    });

    if (existingIngredients.length !== ingredientsIdArray.length) {
        res.status(404).json({
            error: "Raw Ingredient ID must exist"
        });
        return;
    }

    const trimmedName = name.trim();
    const existingName = await prisma.recipe.findUnique({
        where: { name: trimmedName },
    });

    if (existingName) {
        res.status(422).json({
            error: "Name of recipe exists already"
        });
        return;
    }

    const recipe = await prisma.recipe.create({
        data : {
            name : trimmedName,
            servings: servings,
            ingredients: {
                create: ingredientsArray.map((i) => ({
                    rawIngredientId: i.rawIngredientId,
                    quantity: i.quantity,
                }))
            }
        },
        include : { 
            ingredients: {
                include : { rawIngredient: true }
            }
        },
    });

    res.status(201).json(recipe);
});

app.get("/api/production-batches", verifyToken, requireRole("Admin", "Echo"), async (req, res) => {
    const productionBatches = await prisma.productionBatch.findMany({
        include : { 
            order : {
                include : {
                    recipe: true,
                },
            },
            recipe : {
                include : {
                    ingredients : {
                        include : {
                            rawIngredient : true
                        }
                    }
                }
            }
        },
        orderBy : { createdAt: "desc" }
    });
    res.json(productionBatches);
});

app.post("/api/production-batches", verifyToken, requireRole("Admin", "Echo"), async (req, res) => {
    const recipeId = req.body.recipeId;
    const orderId = req.body.orderId;

    if (!isNonEmptyString(recipeId)) {
        res.status(422).json({
            error: "Recipe ID must be a non empty string"
        });
        return;
    }

    if (orderId !== undefined && !isNonEmptyString(orderId)) {
        return res.status(422).json({
            error: "Order ID must be a non-empty string."
    });
}

    const quantityProduced = req.body.quantityProduced;

    if (!isPositiveNumber(quantityProduced)) {
        res.status(422).json({
            error: "Quantity Produced must be a positive number greater than zero"
        });
        return;
    }

    const recipe = await prisma.recipe.findUnique({
        where : { id: recipeId },
        include: { 
            ingredients: {
                include: { rawIngredient: true }
            }
        }
    });

    if (!recipe) {
        res.status(404).json({
            error: "Recipe not found"
        });
        return;
    }

    if (orderId) {
        const order = await prisma.order.findUnique({
            where : { id: orderId }
        });

        if (!order) {
            res.status(404).json({
                error: "Order not found"
            });
            return;
        }
    
        if (order.recipeId !== recipeId) {
            res.status(422).json({
                error: "Recipe ID does not match order."
            });
            return;
        }
    }
    
    const multiplier = quantityProduced;
    
    for (const ingredient of recipe.ingredients) {
        const requiredQuantity =
            ingredient.quantity * multiplier;

        if (
            ingredient.rawIngredient.currentQuantity <
            requiredQuantity
        ) {
            return res.status(422).json({
                error: `Insufficient quantity: ${ingredient.rawIngredient.name}`,
            });
        }
    }

    const result = await prisma.$transaction(async (tx) => {
        const production = await tx.productionBatch.create({
            data: { 
                recipeId: recipeId,
                quantityProduced: quantityProduced,
                orderId: orderId,
                },
            include: { 
                order: true,
                recipe: {
                    include: {
                        ingredients: {
                            include : { rawIngredient: true }
                        }
                    }
                }
            }
        });

        for (const ingredient of recipe.ingredients) {
            const requiredQuantity =
                ingredient.quantity * multiplier;

            const previousQuantity =
                ingredient.rawIngredient.currentQuantity;

            const updatedIngredient = await tx.rawIngredient.update({
                where: {
                    id: ingredient.rawIngredientId,
                },
                data: {
                    currentQuantity: {
                        decrement: requiredQuantity,
                    },
                },
            });
        
            await tx.inventoryTransaction.create({
                data: {
                    rawIngredientId: ingredient.rawIngredientId,
                    type: "PRODUCTION",
                    quantityChange: -requiredQuantity,
                    previousQuantity,
                    newQuantity: updatedIngredient.currentQuantity,
                    productionBatchId: production.id,
                },
            });
        }

        await tx.finishedInventory.upsert({
            where: { recipeId: recipeId },
            update: { quantityAvailable: {
                increment: quantityProduced * recipe.servings
            }},
            create: { 
                recipeId : recipeId,
                quantityAvailable: quantityProduced * recipe.servings,
            }
        });

        return production;
    });

    res.status(201).json(result);
});

app.get("/api/finished-inventory", verifyToken, requireRole("Admin", "DeePlace", "Echo"), async (req, res) => {
    const finishedInventory = await prisma.finishedInventory.findMany({
        include : { recipe: true },
        orderBy: { 
            recipe : {
                name : "asc"
            }
        }
    });
    res.json(finishedInventory);
});

app.post("/api/sales", requireRole("Admin", "DeePlace"), verifyToken, async (req, res) => {
    const recipeId = req.body.recipeId;

    if (!isNonEmptyString(recipeId)) {
        res.status(422).json({
            error: "Recipe ID must be a non empty string"
        });
        return;
    }

    const quantitySold = req.body.quantitySold;

    if (!isPositiveNumber(quantitySold)) {
        res.status(422).json({
            error: "Quantity sold must a positive number greater than zero"
        });
        return;
    }

    const finishedRecipe = await prisma.finishedInventory.findUnique({
        where : { recipeId: recipeId}
    });

    if (!finishedRecipe) {
        res.status(404).json({
            error: "Finished inventory not found"
        });
        return;
    }

    if (finishedRecipe.quantityAvailable < quantitySold) {
        res.status(422).json({
            error: "Quantity available must be greater than quantity sold"
        });
        return;
    }

    const result = await prisma.$transaction(async (tx) => {
        const sale = await tx.sale.create({
            data: {
                recipeId : recipeId,
                quantitySold : quantitySold,
            }
        });

        await tx.finishedInventory.update({
            where : { recipeId: recipeId },
            data : { 
                quantityAvailable : {
                    decrement : quantitySold
                }
            }
        });

        return sale;
    });

    res.status(201).json(result);
});

app.get("/api/sales", requireRole("Admin", "DeePlace"), verifyToken, async (req, res) => {
    const sales = await prisma.sale.findMany({
        include : { recipe: true },
        orderBy : { createdAt: "desc"}
    });
    res.json(sales);
});

app.get(
  "/api/recipes/:id/cost",
  verifyToken,
  requireRole("Admin", "DeePlace", "Echo"),
  async (req, res) => {
    try {
      const recipeId = req.params.id;
      
      if (!isNonEmptyString(recipeId)) {
        return res.status(422).json({
          error: "Recipe ID must be a non-empty string.",
        });
      }
  
      const recipe = await prisma.recipe.findUnique({
        where: {
          id: recipeId,
        },
        include: {
          ingredients: {
            include: {
              rawIngredient: true,
            },
          },
        },
      });
  
      if (!recipe) {
        return res.status(404).json({
          error: "Recipe not found.",
        });
      }
  
      let totalCost = 0;
      const ingredientsArray: RecipeCostIngredient[] = [];
  
      for (const ingredient of recipe.ingredients) {
        const latestPurchaseItem =
          await prisma.purchaseItem.findFirst({
            where: {
              rawIngredientId: ingredient.rawIngredientId,
            },
            include: {
              purchase: true,
            },
            orderBy: [
              {
                purchase: {
                  date: "desc",
                },
              },
              {
                purchase: {
                  createdAt: "desc",
                },
              },
            ],
          });
      
        if (!latestPurchaseItem) {
          ingredientsArray.push({
            rawIngredientId: ingredient.rawIngredientId,
            name: ingredient.rawIngredient.name,
            quantity: ingredient.quantity,
            canonicalUnit: ingredient.rawIngredient.canonicalUnit,
            pricePerUnit: null,
            cost: null,
            latestPurchaseDate: null,
            purchaseId: null,
          });
      
          continue;
        }
      
        const ingredientCost =
          Math.round(
            ingredient.quantity *
              latestPurchaseItem.pricePerUnit *
              100
          ) / 100;
      
        totalCost =
          Math.round((totalCost + ingredientCost) * 100) / 100;
      
        ingredientsArray.push({
          rawIngredientId: ingredient.rawIngredientId,
          name: ingredient.rawIngredient.name,
          quantity: ingredient.quantity,
          canonicalUnit: ingredient.rawIngredient.canonicalUnit,
          pricePerUnit: latestPurchaseItem.pricePerUnit,
          cost: ingredientCost,
          latestPurchaseDate: latestPurchaseItem.purchase.date,
          purchaseId: latestPurchaseItem.purchase.id,
        });
      }
  
      const hasMissingCostData = ingredientsArray.some(
        (ingredient) => ingredient.cost === null
      );
  
      const costPerServing = hasMissingCostData
      ? null
      : Math.round(
          (totalCost / recipe.servings) * 100
        ) / 100;
      
      const response = {
        recipeId: recipe.id,
        recipeName: recipe.name,
        servings: recipe.servings,
        totalCost: hasMissingCostData ? null : totalCost,
        costPerServing,
        hasMissingCostData,
        ingredients: ingredientsArray,
      };
  
      return res.status(200).json(response);
    } catch (error) {
        console.error(error);

      return res.status(500).json({
        error: "Failed to calculate recipe cost.",
      });
    }
  },     
);

app.post("/api/sales-import/preview", verifyToken, requireRole("Admin", "DeePlace"), upload.single("file"), async (req, res) => {
    if (!req.file) {
        res.status(422).json({
            error: "CSV file is required"
        });
        return;
    }

    const csvText = req.file.buffer.toString("utf-8");

    const rows = parse(csvText, {
        columns: true,
        delimiter: ";",
        skip_empty_lines: true,
        trim: true,
    });

    const mappedPreview = await Promise.all(
        rows
            .filter((row: any) => row.Product?.trim())
            .map(async (row: any) => {
                const productName = row.Product.trim();
                const quantitySold = Number(row["S.Qty"]);
    
                const mapping = await prisma.pOSProductMapping.findUnique({
                    where: {
                        posProductName: productName,
                    },
                    include: {
                        recipe: true,
                    },
                });
    
                return {
                    productName,
                    quantitySold,
                    recipeId: mapping?.recipeId ?? null,
                    recipeName: mapping?.recipe.name ?? null,
                    status: mapping ? "mapped" : "unmapped",
                };
            })
    );
    
    const preview = mappedPreview.filter((row) => row.quantitySold > 0);
    
    res.json(preview);
});

app.post("/api/sales-import/mappings", verifyToken, requireRole("Admin", "DeePlace"), async (req, res) => {
    const posProductName = req.body.posProductName;
    const recipeId = req.body.recipeId;

    if (!isNonEmptyString(posProductName)) {
        res.status(422).json({ error: "POS product name must be a non-empty string" });
        return;
    }

    if (!isNonEmptyString(recipeId)) {
        res.status(422).json({ error: "Recipe ID must be a non-empty string" });
        return;
    }

    const recipe = await prisma.recipe.findUnique({
        where: { id: recipeId },
    });

    if (!recipe) {
        res.status(404).json({ error: "Recipe not found" });
        return;
    }

    const mapping = await prisma.pOSProductMapping.upsert({
        where: { posProductName: posProductName.trim() },
        update: { recipeId },
        create: {
            posProductName: posProductName.trim(),
            recipeId,
        },
        include: { recipe: true },
    });

    res.status(201).json(mapping);
});

app.post("/api/sales-import/confirm", verifyToken, requireRole("Admin", "DeePlace"), async (req, res) => {
    const imports = req.body;

    if (!Array.isArray(imports)) {
        res.status(422).json({
            error: "Imports must be an array."
        });
        return;
    }

    const summary = await prisma.$transaction(async (tx) => {
        const summary = [];

        for (const item of imports) {
            if (!isNonEmptyString(item.productName)) {
                summary.push({
                    productName: item.productName,
                    quantitySold: item.quantitySold,
                    status: "skipped",
                    reason: "Product name is missing",
                });
                continue;
            }

            if (!isPositiveNumber(item.quantitySold)) {
                summary.push({
                    productName: item.productName,
                    quantitySold: item.quantitySold,
                    status: "skipped",
                    reason: "Quantity sold must be greater than zero",
                });
                continue;
            }

            const productName = item.productName.trim();

            const mapping = await tx.pOSProductMapping.findUnique({
                where: {
                    posProductName: productName,
                },
                include: {
                    recipe: true,
                },
            });

            if (!mapping) {
                summary.push({
                    productName,
                    quantitySold: item.quantitySold,
                    status: "skipped",
                    reason: "No recipe mapping found",
                });
                continue;
            }

            const inventory = await tx.finishedInventory.findUnique({
                where: {
                    recipeId: mapping.recipeId,
                },
                include: {
                    recipe: true,
                },
            });

            if (!inventory) {
                summary.push({
                    productName,
                    quantitySold: item.quantitySold,
                    status: "skipped",
                    reason: "No finished inventory found",
                    recipeId: mapping.recipeId,
                    recipeName: mapping.recipe.name,
                });
                continue;
            }

            if (inventory.quantityAvailable < item.quantitySold) {
                summary.push({
                    productName,
                    quantitySold: item.quantitySold,
                    status: "skipped",
                    reason: "Insufficient finished inventory",
                    recipeId: mapping.recipeId,
                    recipeName: mapping.recipe.name,
                    quantityAvailable: inventory.quantityAvailable,
                });
                continue;
            }

            await tx.finishedInventory.update({
                where: {
                    recipeId: mapping.recipeId,
                },
                data: {
                    quantityAvailable: {
                        decrement: item.quantitySold,
                    },
                },
            });

            await tx.salesImport.create({
                data: {
                    posProductName: productName,
                    quantitySold: item.quantitySold,
                    recipeId: mapping.recipeId,
                },
            });

            summary.push({
                productName,
                quantitySold: item.quantitySold,
                status: "imported",
                recipeId: mapping.recipeId,
                recipeName: mapping.recipe.name,
                quantityAvailableBefore: inventory.quantityAvailable,
                quantityAvailableAfter: inventory.quantityAvailable - item.quantitySold,
            });
        }

        return summary;
    });

    res.status(201).json(summary);
});

app.get("/api/dashboard", verifyToken, requireRole("Admin", "DeePlace", "Echo"), async (req, res) => {
    const availableServings = await prisma.finishedInventory.aggregate({
        _sum: { quantityAvailable: true }
    });

    const totalServings = availableServings._sum.quantityAvailable ?? 0

    const finishedProducts = await prisma.finishedInventory.count({
        where: {
            quantityAvailable: {
                gt: 0
            },
        },
    });

    const lowStockIngredients = await prisma.rawIngredient.count({
        where: {
            currentQuantity: {
                lt: 1
            },
        },
    });

    const numRecipes = await prisma.recipe.count();

    const lowStockItems = await prisma.rawIngredient.findMany({
        where: {
            currentQuantity: {
                lt: 1,
            },
        },
        select: {
            id: true,
            name: true,
            currentQuantity: true,
            canonicalUnit: true,
        },
        orderBy: {
            currentQuantity: "asc",
        },
    });

    const recentImports = await prisma.salesImport.findMany({
        take: 10,
        orderBy: {
            importedAt: "desc",
        },
        select: {
            id: true,
            importedAt: true,
            posProductName: true,
            quantitySold: true,
            recipe: {
                select : {
                    name: true
                }
            }
        },
    });

    res.json({
        availableServings: totalServings,
        finishedProducts,
        lowStockIngredients,
        numRecipes,
        lowStockItems,
        recentImports,
    });
});

app.get("/api/orders", verifyToken, requireRole("Admin", "DeePlace", "Echo"), async (req,res) => {
    try {
        const orders = await prisma.order.findMany({
        orderBy: { createdAt: "desc"},
        include: {
            recipe: true,
        },
    });
    return res.json(orders);
    } catch (error) {
        console.error(error);

        return res.status(500).json({
            error: "Failed to retrieve orders.",
        });
    }
});

app.get("/api/orders/:id", verifyToken, async (req,res) => {
    try {
        const { id: orderId } = req.params;

        if (!isNonEmptyString(orderId)) {
            return res.status(422).json({
                error: "Order ID must be a non-empty string.",
            });
        }

        const existingOrder = await prisma.order.findUnique({
            where: { id: orderId },
            include: {
                recipe: true,
                statusLogs: {
                    orderBy: {
                        createdAt: "asc",
                    },
                },
            },
        });

        if (!existingOrder) {
            return res.status(404).json({
                error: "Order not found.",
            });
        }

        return res.json(existingOrder);
    } catch (error) {
        console.error(error);

        return res.status(500).json({
            error: "Failed to retrieve order."
        });
    }
});

app.post("/api/orders", verifyToken, requireRole("Admin", "DeePlace", "Echo"), async (req, res) => {
    const { recipeId, quantity, location } = req.body;

    const validOrderLocations = [
      "DEE_PLACE",
      "ECHO_POKER",
      "ECHO_EVENTS",
    ];

    if (
      !isNonEmptyString(location) ||
      !validOrderLocations.includes(location)
    ) {
      return res.status(400).json({
        error:
          "Location must be DeePlace, Echo Poker, or Echo Events.",
      });
    }

    if (!isNonEmptyString(recipeId)) {
        return res.status(400).json({ error: "Recipe ID is required." });
    }

    if (!isPositiveNumber(quantity)) {
        return res.status(400).json({ error: "Quantity must be a positive number." });
    }

    const recipe = await prisma.recipe.findUnique({
        where: { id: recipeId },
    });

    if (!recipe) {
        return res.status(404).json({ error: "Recipe not found."})
    }

    try {
        const order = await prisma.$transaction(async (tx) => {

        const createdOrder = await tx.order.create({
            data: {
                recipeId,
                quantity,
                location,
            },
            include: {
                recipe: true,
            },
        });

        await tx.orderStatusLog.create({
            data: {
                orderId: createdOrder.id,
                previousStatus: null,
                newStatus: OrderStatus.CREATED,
            },
        });

        return createdOrder;
    });

        return res.status(201).json(order);
    } catch (error) {
        console.error(error);
        return res.status(500).json({
            error: "Failed to create order."
        })
    }
});

const nextStatus: Partial<Record<OrderStatus, OrderStatus>> = {
        [OrderStatus.CREATED]: OrderStatus.PENDING,
        [OrderStatus.PENDING]: OrderStatus.DONE,
        [OrderStatus.DONE]: OrderStatus.DELIVERY,
        [OrderStatus.DELIVERY]: OrderStatus.FINISHED,
    };

app.patch("/api/orders/:id/status", verifyToken, requireRole("Admin", "DeePlace", "Echo"), async (req,res) => {

    const { id: orderId } = req.params;
    const status = req.body.status;
    
    if (!isNonEmptyString(orderId)) {
        return res.status(422).json({
            error: "Order ID must be of type String and non-empty"
        });
    }

    const existingOrder = await prisma.order.findUnique({
        where: { id: orderId },
    });

    if (!existingOrder) {
        return res.status(404).json({
            error: "Order not found.",
        });
    }

   if (!isNonEmptyString(status) ||
       !Object.values(OrderStatus).includes(status as OrderStatus)) {
        return res.status(422).json({
            error: "Invalid order status.",
        });
   }

   const newStatus = status as OrderStatus;

   if (existingOrder.status === newStatus) {
        return res.status(409).json({
            error: `Order is already ${status}.`,
        });
   }

   const expectedStatus = nextStatus[existingOrder.status];

   if (newStatus !== expectedStatus) {
       return res.status(409).json({
           error: `Order cannot move from ${existingOrder.status} to ${newStatus}.`,
           expectedStatus,
       });
   }

   try {

       const updatedOrder = await prisma.$transaction(async (tx) => {
            const order = await tx.order.update({
                where: { id: existingOrder.id },
                data: { status: newStatus },
                include: {
                    recipe: true,
                },
            }); 

            await tx.orderStatusLog.create({
            data: {
                orderId: order.id,
                previousStatus: existingOrder.status,
                newStatus: newStatus,
            },
        });

        return order;
       });

       return res.status(200).json(updatedOrder);
   } catch (error) {
        console.error(error);

        return res.status(500).json({
            error: "Failed to update order status.",
        });
   }
});

app.get(
  "/api/inventory-transfers",
  verifyToken,
  requireRole("Admin", "Echo"),
  async (req, res) => {
    try {
      const transfers = await prisma.inventoryTransfer.findMany({
        orderBy: {
          createdAt: "desc",
        },
        include: {
          items: {
            include: {
              rawIngredient: true,
            },
          },
        },
      });

      return res.status(200).json(transfers);
    } catch (error) {
      console.error(error);

      return res.status(500).json({
        error: "Failed to load inventory transfers.",
      });
    }
  },
);

app.post(
  "/api/inventory-transfers",
  verifyToken,
  requireRole("Admin", "Echo"),
  async (req, res) => {
    try {
      const {
        sourceLocation,
        destinationLocation,
        items,
      } = req.body;

      const isValidTransfer =
        (sourceLocation === "ECHO_KITCHEN" &&
          destinationLocation === "DEE_PLACE") ||
        (sourceLocation === "DEE_PLACE" &&
          destinationLocation === "ECHO_KITCHEN");
      
      if (!isValidTransfer) {
        return res.status(400).json({
          error:
            "Transfers are only supported between Echo Kitchen and DeePlace.",
        });
      }

      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({
          error: "At least one transfer item is required.",
        });
      }
      
      for (const item of items) {
        if (
          typeof item.rawIngredientId !== "string" ||
          item.rawIngredientId.trim() === ""
        ) {
          return res.status(400).json({
            error: "Each transfer item requires a raw ingredient.",
          });
        }
      
        if (
          typeof item.quantity !== "number" ||
          !Number.isFinite(item.quantity) ||
          item.quantity <= 0
        ) {
          return res.status(400).json({
            error: "Transfer quantities must be greater than 0.",
          });
        }
      }

      const rawIngredientIds = items.map(
        (item) => item.rawIngredientId
      );
      
      if (
        new Set(rawIngredientIds).size !==
        rawIngredientIds.length
      ) {
        return res.status(400).json({
          error:
            "The same ingredient cannot appear more than once in a transfer.",
        });
      }

      const result = await prisma.$transaction(async (tx) => {
        const transfer = await tx.inventoryTransfer.create({
          data: {
            sourceLocation,
            destinationLocation,
          },
        });
    
        for (const item of items) {
          const rawIngredient = await tx.rawIngredient.findUnique({
            where: {
              id: item.rawIngredientId,
            },
          });
      
          if (!rawIngredient) {
            throw new Error("RAW_INGREDIENT_NOT_FOUND");
          }
      
          const previousQuantity = rawIngredient.currentQuantity;
      
          let updatedIngredient;
      
          if (sourceLocation === "ECHO_KITCHEN") {
            if (previousQuantity < item.quantity) {
              throw new Error(
                `INSUFFICIENT_INVENTORY:${rawIngredient.name}`,
              );
            }
        
            updatedIngredient = await tx.rawIngredient.update({
              where: {
                id: rawIngredient.id,
              },
              data: {
                currentQuantity: {
                  decrement: item.quantity,
                },
              },
            });
          } else {
            updatedIngredient = await tx.rawIngredient.update({
              where: {
                id: rawIngredient.id,
              },
              data: {
                currentQuantity: {
                  increment: item.quantity,
                },
              },
            });
          }
      
          await tx.inventoryTransferItem.create({
            data: {
              transferId: transfer.id,
              rawIngredientId: rawIngredient.id,
              quantity: item.quantity,
            },
          });
      
          await tx.inventoryTransaction.create({
            data: {
              rawIngredientId: rawIngredient.id,
              type:
                sourceLocation === "ECHO_KITCHEN"
                  ? "TRANSFER_OUT"
                  : "TRANSFER_IN",
              quantityChange:
                sourceLocation === "ECHO_KITCHEN"
                  ? -item.quantity
                  : item.quantity,
              previousQuantity,
              newQuantity: updatedIngredient.currentQuantity,
              inventoryTransferId: transfer.id,
            },
          });
        }
    
        return tx.inventoryTransfer.findUnique({
          where: {
            id: transfer.id,
          },
          include: {
            items: {
              include: {
                rawIngredient: true,
              },
            },
            inventoryTransactions: true,
          },
        });
      });
      
      return res.status(201).json(result);

    } catch (error) {
      console.error(error);
    
      if (
        error instanceof Error &&
        error.message === "RAW_INGREDIENT_NOT_FOUND"
      ) {
        return res.status(404).json({
          error: "Raw ingredient not found.",
        });
      }
    
      if (
        error instanceof Error &&
        error.message.startsWith("INSUFFICIENT_INVENTORY:")
      ) {
        const ingredientName = error.message.split(":")[1];
    
        return res.status(422).json({
          error: `Insufficient Echo Kitchen inventory for ${ingredientName}.`,
        });
      }
    
      return res.status(500).json({
        error: "Failed to create inventory transfer.",
      });
    }
  }
);

app.get("/api/supply-items", verifyToken, requireRole("Admin", "Echo"), async (req, res) => {
    try {
        const supplies = await prisma.supplyItem.findMany({
            orderBy: { createdAt: "desc"}
        });

        return res.status(200).json(supplies);
    } catch (error) {
        console.error(error);

        return res.status(500).json({
            error: "Failed to load supply items.",
        });
    }
});

app.post(
  "/api/supply-items",
  verifyToken,
  requireRole("Admin", "Echo"),
  async (req, res) => {
    try {
      const name = req.body.name;
      const currentQuantity = req.body.currentQuantity;
      const canonicalUnit = req.body.canonicalUnit;

      if (!isNonEmptyString(name)) {
        return res.status(422).json({
          error: "Supply item name must be a non-empty string.",
        });
      }

      if (!isNonNegativeNumber(currentQuantity)) {
        return res.status(422).json({
          error: "Quantity must be a non-negative number.",
        });
      }

      const validUnits = Object.values(MeasurementUnit);

      if (
        !isNonEmptyString(canonicalUnit) ||
        !validUnits.includes(canonicalUnit as MeasurementUnit)
      ) {
        return res.status(422).json({
          error: "Canonical unit is invalid.",
        });
      }

      const normalizedName = normalizeInventoryItemName(name);

      const existingSupplyItem =
        await prisma.supplyItem.findUnique({
          where: {
            name: normalizedName,
          },
        });

      if (existingSupplyItem) {
        return res.status(409).json({
          error: "Supply item already exists.",
        });
      }

      const supplyItem = await prisma.supplyItem.create({
        data: {
          name: normalizedName,
          currentQuantity,
          canonicalUnit:
            canonicalUnit as MeasurementUnit,
        },
      });

      return res.status(201).json(supplyItem);
    } catch (error) {
      console.error(error);

      return res.status(500).json({
        error: "Failed to create supply item.",
      });
    }
  },
);

function isNonEmptyString(value: unknown): boolean {
    if (typeof value === 'string') {
        const trimmedName = value.trim();
        if (!trimmedName) return false;
        return true;
    }
    return false;
}

function isPositiveNumber(num: unknown): boolean {
    if (typeof num === 'number') {
        if (num <= 0 || num === Number.POSITIVE_INFINITY || num === Number.NEGATIVE_INFINITY || Number.isNaN(num)) return false;
        return true;
    }
    return false;
}

function isValidDate(date: unknown): boolean {
    if (typeof date === 'string') {
        const timestamp = Date.parse(date);
        return !Number.isNaN(timestamp);
    }
    return false
}

function isNonNegativeNumber(num: unknown): boolean {
    if (typeof num === 'number') {
        if (num < 0 || num === Number.POSITIVE_INFINITY || num === Number.NEGATIVE_INFINITY || Number.isNaN(num)) return false;
        return true;
    }
    return false;
}

function normalizeInventoryItemName(name: string) {
    return name.trim().toLowerCase();
}

const getPurchaseEditLock = async (
  purchaseId: string,
) => {
  const purchase = await prisma.purchase.findUnique({
    where: {
      id: purchaseId,
    },
    include: {
      items: true,
    },
  });

  if (!purchase) {
    return {
      purchase: null,
      locked: false,
    };
  }

  const purchaseTransactions =
    await prisma.inventoryTransaction.findMany({
      where: {
        purchaseId,
        type: "PURCHASE",
      },
    });

  if (purchaseTransactions.length === 0) {
    return {
      purchase,
      locked: true,
    };
  }

  for (const transaction of purchaseTransactions) {
    const hasRawIngredient = !!transaction.rawIngredientId;
    const hasSupplyItem = !!transaction.supplyItemId;

    if (hasRawIngredient === hasSupplyItem) {
      return {
        purchase,
        locked: true,
      };
    }

    const laterTransaction =
      await prisma.inventoryTransaction.findFirst({
        where: {
          purchaseId: {
            not: purchaseId,
          },
          ...(transaction.rawIngredientId && {
            rawIngredientId:
              transaction.rawIngredientId,
          }),
          ...(transaction.supplyItemId && {
            supplyItemId:
              transaction.supplyItemId,
          }),
          createdAt: {
            gt: transaction.createdAt,
          },
        },
        orderBy: {
          createdAt: "asc",
        },
      });

    if (laterTransaction) {
      return {
        purchase,
        locked: true,
      };
    }
  }

  return {
    purchase,
    locked: false,
  };
};

type RecipeCostIngredient = {
  rawIngredientId: string;
  name: string;
  quantity: number;
  canonicalUnit: MeasurementUnit;
  pricePerUnit: number | null;
  cost: number | null;
  latestPurchaseDate: Date | null;
  purchaseId: string | null;
};

app.listen(3001, () => {
    console.log("Server running on http://localhost:3001");
});


