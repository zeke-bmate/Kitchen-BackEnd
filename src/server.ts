import express from "express";
import cors from "cors";
import { prisma } from "./prisma.js";
import multer from "multer";
import { parse } from "csv-parse/sync"
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { OrderStatus } from "@prisma/client";

const app = express();

const upload = multer({
    storage: multer.memoryStorage(),
})

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
    const verified = jwt.verify(token, process.env.JWT_SECRET);
    req.user = verified; // Adds user data (id) to the request object
    next();
  } catch (error) {
    res.status(403).json({ message: "Invalid or expired token." });
  }
};

app.use(cors());
app.use(express.json());

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  //const isPasswordValid = bcrypt.compareSync(password, mockUser.passwordHash);
  const uid = await prisma.user.findFirst({
    where: { username: "super", password: password }
  });

  if(!uid){
    return res.status(400).json({ message: "Invalid credentials." });
  } else {
    // Generate JWT (Expires in 1 hour)
    const token = jwt.sign(
        { userId: uid.id }, 
        process.env.JWT_SECRET, 
        { expiresIn: '15min' }
    );
    res.json({ token });
  }
  
});

app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
});

app.get("/api/suppliers", verifyToken, async (req, res) => {
    const suppliers = await prisma.supplier.findMany({
        orderBy: { createdAt: "desc"}
    });
    res.json(suppliers);
});

app.post("/api/suppliers", verifyToken, async (req, res) => {
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

app.get("/api/purchases", verifyToken, async (req, res) => {
    const purchases = await prisma.purchase.findMany({
        include: { 
            supplier: true,
            items: true,
        },
        orderBy: { createdAt: "desc"},
    });
    res.json(purchases);
});

app.post("/api/purchases", verifyToken, async (req, res) => {
    const items = req.body.items;
    const date = req.body.date;
    const supplierId = req.body.supplierId;
    if (!Array.isArray(items) || items.length === 0) {
        res.status(422).json({
            error: "Items must be a non-empty array"
        });
        return;
    }
    if (!isValidDate(date)) {
        res.status(422).json({
            error: "Date must be of type String and valid"
        });
        return;
    }
    if (!isNonEmptyString(supplierId)) {
        res.status(422).json({
            error: "Supplier ID must be of type String and non-empty"
        });
        return;
    }

    const existingSupplierID = await prisma.supplier.findUnique({
        where: { id: supplierId },
    });

    if (!existingSupplierID) {
        res.status(422).json({
            error: "Supplier does not exist"
        });
        return;
    }
    const validatedItems: { itemName: any; orderUnits: any; weightKg: any; pricePerKg: any; totalPrice: number; }[] = []
    let purchaseTotal = 0
    for (const i of items) {
        const itemName = i.itemName
        const orderUnits = i.orderUnits
        const weightKg = i.weightKg;
        const pricePerKg = i.pricePerKg;

        if (!isNonEmptyString(itemName)) {
            res.status(422).json({
                error: "Item Name must be of type String and non-empty"
            });
            return;
        }

        if (!isNonEmptyString(orderUnits)) {
            res.status(422).json({
                error: "Order Units must be of type String and non-empty"
            });
            return;
        }

        if (!isPositiveNumber(weightKg)) {
            res.status(422).json({
                error: "Weight must be a positive number greater than zero"
            });
            return;
        }

        if (!isPositiveNumber(pricePerKg)) {
            res.status(422).json({
                error: "Price per KG must be a positive number greater than zero"
            });
            return;
        }

        const totalPrice = weightKg * pricePerKg;
        const trimmedName = normalizeIngredientName(itemName)
        const trimmedOrderUnits = orderUnits.trim();
        validatedItems.push({
            itemName: trimmedName,
            orderUnits: trimmedOrderUnits,
            weightKg: weightKg,
            pricePerKg: pricePerKg,
            totalPrice: totalPrice,
        });
        purchaseTotal += totalPrice
    }

    const result = await prisma.$transaction(async (tx) => {
        const purchase = await tx.purchase.create({
            data: { 
                date: new Date(`${date}T12:00:00`),
                supplierId: supplierId,
                totalPrice: purchaseTotal,
                items: {
                    create: validatedItems
                }},
            include: { 
                supplier: true,
                items: true,
            }
        });

        for (const i of validatedItems) {
            await tx.rawIngredient.upsert({
                where: { name: i.itemName },
                update: { currentWeightKg: {
                    increment: i.weightKg
                }},
                create: { 
                    name: i.itemName,
                    currentWeightKg: i.weightKg,
                }
            });
        }

        return purchase ;
    });

    res.status(201).json(result);
});

app.get("/api/raw-ingredients", verifyToken, async (req, res) => {
    const ingredients = await prisma.rawIngredient.findMany({
        orderBy: { name: "asc"},
    });
    res.json(ingredients);
});

app.post("/api/raw-ingredients", verifyToken, async (req, res) => {
    const name = req.body.name;
    const currentWeightKg = req.body.currentWeightKg;

    if (!isNonEmptyString(name)) {
        res.status(422).json({
            error: "Ingredient name must be of type String and non-empty"
        });
        return;
    }

    if (!isNonNegativeNumber(currentWeightKg)) {
        res.status(422).json({
            error: "Weight must be a non-negative number"
        });
        return;
    }

    const trimmedName = normalizeIngredientName(name);
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
            currentWeightKg: currentWeightKg,
            }
    });

    return res.status(201).json(ingredient);
});

app.patch("/api/raw-ingredients/:id", verifyToken, async (req,res) => {
    const currentWeightKg = req.body.currentWeightKg;

    if (!isNonNegativeNumber(currentWeightKg)) {
        res.status(422).json({
            error: "Weight must be a non-negative number"
        });
        return;
    }

    const ingredientId = req.params.id;

    const existingIngredient = await prisma.rawIngredient.findUnique({
        where : { id : ingredientId }
    });

    if (!existingIngredient) {
        res.status(404).json({
            error: "Ingredient not found"
        });
        return;
    }

    const updatedIngredient = await prisma.rawIngredient.update({
        data: {
            currentWeightKg: currentWeightKg,
        },
        where: {
            id: ingredientId,
        },
    });

    res.status(200).json(updatedIngredient);
});

app.get("/api/recipes", verifyToken, async (req, res) => {
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

app.post("/api/recipes", verifyToken, async (req, res) => {
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
        const weightKg = ingredient.weightKg;

        if (!isPositiveNumber(weightKg)) {
            res.status(422).json({
                error: "Weight must be a positive number greater than zero"
            });
            return;
        }

        const ingredientId = ingredient.rawIngredientId;

        if (!isNonEmptyString(ingredientId)) {
            res.status(422).json({
                error: "Raw Ingredient ID must be of type String and non-empty"
            });
            return;
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
                    weightKg: i.weightKg,
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

app.get("/api/production-batches", verifyToken, async (req, res) => {
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

app.post("/api/production-batches", verifyToken, async (req, res) => {
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
        const requiredKg = ingredient.weightKg * multiplier;
        if (ingredient.rawIngredient.currentWeightKg < requiredKg) {
            res.status(422).json({
                error: `Insufficient weight: ${ingredient.rawIngredient.name}`
            });
            return;
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
            const requiredKg = ingredient.weightKg * multiplier;
            await tx.rawIngredient.update({
                where: { id: ingredient.rawIngredientId },
                data: { currentWeightKg: {
                    decrement: requiredKg
                }},
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

app.get("/api/finished-inventory", verifyToken, async (req, res) => {
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

app.post("/api/sales", async (req, res) => {
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

app.get("/api/sales", verifyToken, async (req, res) => {
    const sales = await prisma.sale.findMany({
        include : { recipe: true },
        orderBy : { createdAt: "desc"}
    });
    res.json(sales);
});

app.get("/api/recipes/:id/cost", verifyToken, async (req, res) => {
    const recipeId = req.params.id;

    if (!isNonEmptyString(recipeId)) {
        res.status(422).json({
            error: "Recipe ID must be a non empty string"
        });
        return;
    }

    const recipe = await prisma.recipe.findUnique({
        where : { id: recipeId},
        include: {
            ingredients : {
                include : {
                    rawIngredient: true
                }
            }
        }
    });

    if (!recipe) {
        res.status(404).json({
            error: "Recipe not found"
        });
        return;
    }

    let totalCost = 0;
    let ingredientsArray = [];

    for (const ingredient of recipe.ingredients) {
        const latestPrice = await prisma.purchase.findFirst({
            where: { itemName: ingredient.rawIngredient.name},
            orderBy: { date: "desc"}
        });

        if (!latestPrice) {
            res.status(404).json({
                error: `${ingredient.rawIngredient.name}: Purchase not found`
            });
            return;
        }

        const ingredientCost = Math.round((ingredient.weightKg * latestPrice.pricePerKg) * 100) / 100;
        totalCost = Math.round((totalCost + ingredientCost) * 100) / 100;
        ingredientsArray.push({
            name: ingredient.rawIngredient.name,
            weightKg: ingredient.weightKg,
            pricePerKg: latestPrice.pricePerKg,
            cost: ingredientCost
        });
    }

    const costPerServing = Math.round((totalCost / recipe.servings) * 100) / 100;

    const response = {
        recipeId: recipeId,
        recipeName: recipe.name,
        servings: recipe.servings,
        totalCost: totalCost,
        costPerServing: costPerServing,
        ingredients: ingredientsArray,
    }

    res.status(200).json(response);
});

app.post("/api/sales-import/preview", verifyToken, upload.single("file"), async (req, res) => {
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

app.post("/api/sales-import/mappings", verifyToken, async (req, res) => {
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

app.post("/api/sales-import/confirm", verifyToken, async (req, res) => {
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

app.get("/api/dashboard", verifyToken, async (req, res) => {
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
            currentWeightKg: {
                lt: 1
            },
        },
    });

    const numRecipes = await prisma.recipe.count();

    const lowStockItems = await prisma.rawIngredient.findMany({
        where: {
            currentWeightKg: {
                lt: 1
            }
        },
        select: {
            id: true,
            name: true,
            currentWeightKg: true,
        },
        orderBy: {
            currentWeightKg: "asc",
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

app.get("/api/orders", verifyToken, async (req,res) => {
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

app.post("/api/orders", verifyToken, async (req, res) => {
    const { recipeId, quantity } = req.body;

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

app.patch("/api/orders/:id/status", verifyToken, async (req,res) => {

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

function normalizeIngredientName(name: string) {
    return name.trim().toLowerCase();
}

app.listen(3001, () => {
    console.log("Server running on http://localhost:3001");
});


