import { prisma } from "../src/prisma.js";
import bcrypt from "bcryptjs";

async function main() {
  await prisma.user.deleteMany();
  await prisma.rolePermission.deleteMany();
  await prisma.permission.deleteMany();
  await prisma.role.deleteMany();

  await prisma.$executeRawUnsafe(
    `UPDATE sqlite_sequence SET seq = 0 WHERE name = 'Role';`
  );

  const passwordHash = await bcrypt.hash("super123", 10);

  const roles = await prisma.role.createManyAndReturn({
    data: [
      { name: "Admin" },
      { name: "DeePlace" },
      { name: "Echo" },
    ],
    select: {
      id: true,
      name: true,
    },
  });

  const adminRole = roles.find((role) => role.name === "Admin");
  const echoRole = roles.find((role) => role.name === "Echo");
  const deePlaceRole = roles.find((role) => role.name === "DeePlace");

  if (!adminRole || !echoRole || !deePlaceRole) {
    throw new Error("Required roles were not created.");
  }

  await prisma.user.create({
    data: {
      name: "Administrator",
      username: "super",
      passwordHash,
      roleId: adminRole.id,
    },
  });

  const permissions = await prisma.permission.createManyAndReturn({
    data: [
      {
        key: "purchases.view",
        module: "purchases",
        description: "View purchases",
      },
      {
        key: "purchases.create",
        module: "purchases",
        description: "Create purchases",
      },
      {
        key: "purchases.edit",
        module: "purchases",
        description: "Edit purchases",
      },
      {
        key: "purchases.view_cost",
        module: "purchases",
        description: "View purchase pricing and cost information",
      },
      {
        key: "suppliers.view",
        module: "suppliers",
        description: "View suppliers",
      },
      {
        key: "suppliers.create",
        module: "suppliers",
        description: "Create suppliers",
      },
      {
        key: "inventory.view",
        module: "inventory",
        description: "View inventory",
      },
      {
        key: "inventory.adjust",
        module: "inventory",
        description: "Adjust inventory quantities",
      },
      {
        key: "inventory.transactions.view",
        module: "inventory",
        description: "View inventory transaction history",
      },{
        key: "recipes.view",
        module: "recipes",
        description: "View recipes",
      },
      {
        key: "recipes.create",
        module: "recipes",
        description: "Create recipes",
      },
      {
        key: "recipes.view_cost",
        module: "recipes",
        description: "View recipe cost information",
      },
      {
        key: "production.view",
        module: "production",
        description: "View production batches",
      },
      {
        key: "production.create",
        module: "production",
        description: "Create production batches",
      },
      {
        key: "finished_inventory.view",
        module: "finished_inventory",
        description: "View finished inventory",
      },
      {
        key: "sales.view",
        module: "sales",
        description: "View sales",
      },
      {
        key: "sales.create",
        module: "sales",
        description: "Create sales",
      },
      {
        key: "sales.import",
        module: "sales",
        description: "Import sales from POS",
      },
      {
        key: "sales.mapping.manage",
        module: "sales",
        description: "Manage POS product mappings",
      },
      {
        key: "orders.view",
        module: "orders",
        description: "View orders",
      },
      {
        key: "orders.create",
        module: "orders",
        description: "Create orders",
      },
      {
        key: "orders.update_status",
        module: "orders",
        description: "Update order status",
      },
      {
        key: "inventory.transfer.view",
        module: "inventory",
        description: "View inventory transfers",
      },
      {
        key: "inventory.transfer.create",
        module: "inventory",
        description: "Create inventory transfers",
      },
      {
        key: "users.view",
        module: "users",
        description: "View users",
      },
      {
        key: "users.create",
        module: "users",
        description: "Create users",
      },
      {
        key: "roles.view",
        module: "roles",
        description: "View roles",
      },
      {
        key: "permissions.view",
        module: "permissions",
        description: "View permissions",
      },
      {
        key: "permissions.manage",
        module: "permissions",
        description: "Manage role permissions",
      },
      {
        key: "dashboard.view",
        module: "dashboard",
        description: "View dashboard",
      },
    ],
    select: {
      id: true,
      key: true,
    },
  });

  const rolePermissions = [];

  const echoPermissionKeys = [
    "purchases.view",
    "purchases.create",
    "purchases.edit",
    "purchases.view_cost",

    "suppliers.view",
    "suppliers.create",

    "inventory.view",
    "inventory.adjust",
    "inventory.transactions.view",
    "inventory.transfer.view",
    "inventory.transfer.create",

    "recipes.view",
    "recipes.create",
    "recipes.view_cost",

    "production.view",
    "production.create",

    "finished_inventory.view",

    "orders.view",
    "orders.create",
    "orders.update_status",
  ];

  const deePlacePermissionKeys = [
    "recipes.view",
    "recipes.view_cost",
    "finished_inventory.view",
    "sales.view",
    "sales.create",
    "sales.import",
    "sales.mapping.manage",
    "orders.view",
    "orders.create",
    "orders.update_status",
  ];

  for (const permission of permissions) {
    rolePermissions.push({
      roleId: adminRole.id,
      permissionId: permission.id,
    });

    if (echoPermissionKeys.includes(permission.key)) {
      rolePermissions.push({
        roleId: echoRole.id,
        permissionId: permission.id,
      });
    }

    if (deePlacePermissionKeys.includes(permission.key)) {
      rolePermissions.push({
        roleId: deePlaceRole.id,
        permissionId: permission.id,
      });
    }
  }

  await prisma.rolePermission.createMany({
    data: rolePermissions,
  });

  console.log("Seed completed successfully.");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });