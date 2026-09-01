export const PERMISSIONS = {
  PURCHASES: {
    VIEW: "purchases.view",
    CREATE: "purchases.create",
    EDIT: "purchases.edit",
    VIEW_COST: "purchases.view_cost",
  },

  SUPPLIERS: {
    VIEW: "suppliers.view",
    CREATE: "suppliers.create",
  },

  INVENTORY: {
    VIEW: "inventory.view",
    ADJUST: "inventory.adjust",
    TRANSACTIONS_VIEW: "inventory.transactions.view",
  },
  
  RECIPES: {
    VIEW: "recipes.view",
    CREATE: "recipes.create",
    VIEW_COST: "recipes.view_cost",
  },
  
  PRODUCTION: {
    VIEW: "production.view",
    CREATE: "production.create",
  },

  FINISHED_INVENTORY: {
    VIEW: "finished_inventory.view",
  },
  
  SALES: {
    VIEW: "sales.view",
    CREATE: "sales.create",
    IMPORT: "sales.import",
    MAPPING_MANAGE: "sales.mapping.manage",
  },

    ORDERS: {
    VIEW: "orders.view",
    CREATE: "orders.create",
    UPDATE_STATUS: "orders.update_status",
  },
  
  INVENTORY_TRANSFER: {
    VIEW: "inventory.transfer.view",
    CREATE: "inventory.transfer.create",
  },

  USERS: {
    VIEW: "users.view",
    CREATE: "users.create",
  },
  
  ROLES: {
    VIEW: "roles.view",
  },

  PERMISSIONS: {
    VIEW: "permissions.view",
    MANAGE: "permissions.manage",
  },

  DASHBOARD: {
    VIEW: "dashboard.view",
  },
} as const;