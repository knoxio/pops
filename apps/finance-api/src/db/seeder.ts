/**
 * Database seeder — inserts test/development data.
 * Exported as a function so it can be called programmatically
 * (e.g. from the env management system when seeding a new environment).
 */
import type BetterSqlite3 from "better-sqlite3";

/**
 * Seed a database with test data.
 * Clears all existing data first, then inserts records atomically.
 * Safe to call on any database that has the full schema applied.
 */
export function seedDatabase(db: BetterSqlite3.Database): void {
  const now = new Date().toISOString();

  const run = db.transaction(() => {
    // -------------------------------------------------------------------------
    // Clear existing data
    // -------------------------------------------------------------------------
    db.exec(`DELETE FROM transactions`);
    db.exec(`DELETE FROM entities`);
    db.exec(`DELETE FROM budgets`);
    db.exec(`DELETE FROM home_inventory`);
    db.exec(`DELETE FROM wish_list`);
    db.exec(`DELETE FROM ai_usage`);

    // -------------------------------------------------------------------------
    // Entities
    // -------------------------------------------------------------------------
    const entities = [
      {
        id: "10000000-0000-4000-8000-000000000001",
        name: "Woolworths",
        type: "Supermarket",
        abn: "88000014675",
        aliases: "Woolies, WOW, Woolworths Metro",
        default_transaction_type: "Expense",
        default_tags: '["Groceries"]',
        notes: "Primary grocery shopping",
      },
      {
        id: "10000000-0000-4000-8000-000000000002",
        name: "Coles",
        type: "Supermarket",
        abn: "45004189708",
        aliases: "Coles Express, Coles Local",
        default_transaction_type: "Expense",
        default_tags: '["Groceries"]',
        notes: null,
      },
      {
        id: "10000000-0000-4000-8000-000000000003",
        name: "Netflix",
        type: "Subscription",
        abn: null,
        aliases: "Netflix.com",
        default_transaction_type: "Expense",
        default_tags: '["Entertainment"]',
        notes: "Streaming service",
      },
      {
        id: "10000000-0000-4000-8000-000000000004",
        name: "Spotify",
        type: "Subscription",
        abn: null,
        aliases: "Spotify Premium",
        default_transaction_type: "Expense",
        default_tags: '["Entertainment"]',
        notes: "Music streaming",
      },
      {
        id: "10000000-0000-4000-8000-000000000005",
        name: "Shell",
        type: "Fuel Station",
        abn: "46004610459",
        aliases: "Shell Coles Express, Shell Service Station",
        default_transaction_type: "Expense",
        default_tags: '["Transport"]',
        notes: "Fuel and convenience",
      },
      {
        id: "10000000-0000-4000-8000-000000000006",
        name: "Amazon AU",
        type: "Retailer",
        abn: "72054094117",
        aliases: "Amazon.com.au, Amazon Australia",
        default_transaction_type: "Expense",
        default_tags: '["Shopping"]',
        notes: "Online marketplace",
      },
      {
        id: "10000000-0000-4000-8000-000000000007",
        name: "Employer",
        type: "Employer",
        abn: null,
        aliases: "Salary, Payroll",
        default_transaction_type: "Income",
        default_tags: '["Salary"]',
        notes: "Primary income source",
      },
      {
        id: "10000000-0000-4000-8000-000000000008",
        name: "Apple",
        type: "Technology",
        abn: null,
        aliases: "Apple Inc, Apple Store, iTunes",
        default_transaction_type: "Expense",
        default_tags: '["Technology"]',
        notes: null,
      },
      {
        id: "10000000-0000-4000-8000-000000000009",
        name: "Bunnings",
        type: "Hardware",
        abn: "63008672179",
        aliases: "Bunnings Warehouse",
        default_transaction_type: "Expense",
        default_tags: '["Home & Garden"]',
        notes: "Hardware and home improvement",
      },
      {
        id: "10000000-0000-4000-8000-000000000010",
        name: "JB Hi-Fi",
        type: "Retailer",
        abn: "98093220136",
        aliases: "JB HiFi, JB",
        default_transaction_type: "Expense",
        default_tags: '["Technology"]',
        notes: "Electronics retailer",
      },
    ];

    const insertEntity = db.prepare(`
      INSERT INTO entities (
        id, name, type, abn, aliases, default_transaction_type,
        default_tags, notes, last_edited_time
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const entity of entities) {
      insertEntity.run(
        entity.id,
        entity.name,
        entity.type,
        entity.abn,
        entity.aliases,
        entity.default_transaction_type,
        entity.default_tags,
        entity.notes,
        now
      );
    }

    // -------------------------------------------------------------------------
    // Transactions
    // -------------------------------------------------------------------------
    const transactions = [
      // Income
      {
        id: "txn-001",
        description: "Salary Payment",
        account: "Bank Account",
        amount: 5200.0,
        date: "2026-02-01",
        type: "Income",
        tags: JSON.stringify(["Salary"]),
        entity_id: "10000000-0000-4000-8000-000000000007",
        entity_name: "Employer",
        location: null,
        country: "Australia",
        related_transaction_id: null,
        notes: "Fortnightly salary",
      },
      {
        id: "txn-002",
        description: "Salary Payment",
        account: "Bank Account",
        amount: 5200.0,
        date: "2026-01-18",
        type: "Income",
        tags: JSON.stringify(["Salary"]),
        entity_id: "10000000-0000-4000-8000-000000000007",
        entity_name: "Employer",
        location: null,
        country: "Australia",
        related_transaction_id: null,
        notes: "Fortnightly salary",
      },
      // Groceries
      {
        id: "txn-003",
        description: "Woolworths Metro",
        account: "Credit Card",
        amount: -87.45,
        date: "2026-02-10",
        type: "Expense",
        tags: JSON.stringify(["Groceries"]),
        entity_id: "10000000-0000-4000-8000-000000000001",
        entity_name: "Woolworths",
        location: "Sydney CBD",
        country: "Australia",
        related_transaction_id: null,
        notes: null,
      },
      {
        id: "txn-004",
        description: "Coles Local",
        account: "Debit Card",
        amount: -124.8,
        date: "2026-02-08",
        type: "Expense",
        tags: JSON.stringify(["Groceries"]),
        entity_id: "10000000-0000-4000-8000-000000000002",
        entity_name: "Coles",
        location: "Surry Hills",
        country: "Australia",
        related_transaction_id: null,
        notes: "Weekly shop",
      },
      {
        id: "txn-005",
        description: "Woolworths",
        account: "Credit Card",
        amount: -156.32,
        date: "2026-02-03",
        type: "Expense",
        tags: JSON.stringify(["Groceries"]),
        entity_id: "10000000-0000-4000-8000-000000000001",
        entity_name: "Woolworths",
        location: "Bondi Junction",
        country: "Australia",
        related_transaction_id: null,
        notes: null,
      },
      // Subscriptions
      {
        id: "txn-006",
        description: "Netflix Subscription",
        account: "Credit Card",
        amount: -22.99,
        date: "2026-02-05",
        type: "Expense",
        tags: JSON.stringify(["Entertainment", "Subscriptions"]),
        entity_id: "10000000-0000-4000-8000-000000000003",
        entity_name: "Netflix",
        location: null,
        country: "Australia",
        related_transaction_id: null,
        notes: "Premium plan",
      },
      {
        id: "txn-007",
        description: "Spotify Premium",
        account: "Credit Card",
        amount: -13.99,
        date: "2026-02-01",
        type: "Expense",
        tags: JSON.stringify(["Entertainment", "Subscriptions"]),
        entity_id: "10000000-0000-4000-8000-000000000004",
        entity_name: "Spotify",
        location: null,
        country: "Australia",
        related_transaction_id: null,
        notes: "Individual plan",
      },
      // Fuel
      {
        id: "txn-008",
        description: "Shell Service Station",
        account: "Credit Card",
        amount: -75.5,
        date: "2026-02-07",
        type: "Expense",
        tags: JSON.stringify(["Transport", "Fuel"]),
        entity_id: "10000000-0000-4000-8000-000000000005",
        entity_name: "Shell",
        location: "Randwick",
        country: "Australia",
        related_transaction_id: null,
        notes: "45L unleaded",
      },
      {
        id: "txn-009",
        description: "Shell Coles Express",
        account: "Credit Card",
        amount: -68.2,
        date: "2026-01-28",
        type: "Expense",
        tags: JSON.stringify(["Transport", "Fuel"]),
        entity_id: "10000000-0000-4000-8000-000000000005",
        entity_name: "Shell",
        location: "Mascot",
        country: "Australia",
        related_transaction_id: null,
        notes: null,
      },
      // Shopping
      {
        id: "txn-010",
        description: "Amazon.com.au",
        account: "Credit Card",
        amount: -89.95,
        date: "2026-02-04",
        type: "Expense",
        tags: JSON.stringify(["Shopping", "Technology"]),
        entity_id: "10000000-0000-4000-8000-000000000006",
        entity_name: "Amazon AU",
        location: null,
        country: "Australia",
        related_transaction_id: null,
        notes: "USB-C cables and phone case",
      },
      {
        id: "txn-011",
        description: "JB Hi-Fi",
        account: "Credit Card",
        amount: -1299.0,
        date: "2026-02-02",
        type: "Expense",
        tags: JSON.stringify(["Technology", "Shopping"]),
        entity_id: "10000000-0000-4000-8000-000000000010",
        entity_name: "JB Hi-Fi",
        location: "Pitt St Mall",
        country: "Australia",
        related_transaction_id: null,
        notes: "New headphones - Sony WH-1000XM5",
      },
      {
        id: "txn-012",
        description: "Bunnings Warehouse",
        account: "Debit Card",
        amount: -147.6,
        date: "2026-01-30",
        type: "Expense",
        tags: JSON.stringify(["Home & Garden"]),
        entity_id: "10000000-0000-4000-8000-000000000009",
        entity_name: "Bunnings",
        location: "Alexandria",
        country: "Australia",
        related_transaction_id: null,
        notes: "Paint supplies for bedroom",
      },
      // Transfer pair
      {
        id: "txn-013",
        description: "Transfer to Savings",
        account: "Bank Account",
        amount: -500.0,
        date: "2026-02-01",
        type: "Transfer",
        tags: JSON.stringify(["Transfer"]),
        entity_id: null,
        entity_name: null,
        location: null,
        country: "Australia",
        related_transaction_id: "txn-014",
        notes: "Monthly savings",
      },
      {
        id: "txn-014",
        description: "Transfer from Bank Account",
        account: "Savings Account",
        amount: 500.0,
        date: "2026-02-01",
        type: "Transfer",
        tags: JSON.stringify(["Transfer"]),
        entity_id: null,
        entity_name: null,
        location: null,
        country: "Australia",
        related_transaction_id: "txn-013",
        notes: "Monthly savings",
      },
      // Historical
      {
        id: "txn-015",
        description: "Salary Payment",
        account: "Bank Account",
        amount: 5200.0,
        date: "2026-01-04",
        type: "Income",
        tags: JSON.stringify(["Salary"]),
        entity_id: "10000000-0000-4000-8000-000000000007",
        entity_name: "Employer",
        location: null,
        country: "Australia",
        related_transaction_id: null,
        notes: "Fortnightly salary",
      },
      {
        id: "txn-016",
        description: "Woolworths",
        account: "Credit Card",
        amount: -203.45,
        date: "2025-12-28",
        type: "Expense",
        tags: JSON.stringify(["Groceries"]),
        entity_id: "10000000-0000-4000-8000-000000000001",
        entity_name: "Woolworths",
        location: "Sydney CBD",
        country: "Australia",
        related_transaction_id: null,
        notes: "Holiday shopping",
      },
    ];

    const insertTransaction = db.prepare(`
      INSERT INTO transactions (
        id, description, account, amount, date, type, tags,
        entity_id, entity_name, location, country, related_transaction_id, notes, last_edited_time
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const txn of transactions) {
      insertTransaction.run(
        txn.id,
        txn.description,
        txn.account,
        txn.amount,
        txn.date,
        txn.type,
        txn.tags,
        txn.entity_id,
        txn.entity_name,
        txn.location,
        txn.country,
        txn.related_transaction_id,
        txn.notes,
        now
      );
    }

    // -------------------------------------------------------------------------
    // Budgets
    // -------------------------------------------------------------------------
    const budgets = [
      {
        id: "budget-001",
        category: "Groceries",
        period: "Monthly",
        amount: 800.0,
        active: 1,
        notes: "Supermarket shopping and essentials",
      },
      {
        id: "budget-002",
        category: "Transport",
        period: "Monthly",
        amount: 300.0,
        active: 1,
        notes: "Fuel, tolls, parking",
      },
      {
        id: "budget-003",
        category: "Entertainment",
        period: "Monthly",
        amount: 150.0,
        active: 1,
        notes: "Streaming, dining out, activities",
      },
      {
        id: "budget-004",
        category: "Shopping",
        period: "Monthly",
        amount: 400.0,
        active: 1,
        notes: "Clothing, electronics, misc purchases",
      },
      {
        id: "budget-005",
        category: "Home & Garden",
        period: "Monthly",
        amount: 200.0,
        active: 1,
        notes: "Maintenance, improvements, supplies",
      },
      {
        id: "budget-006",
        category: "Utilities",
        period: "Monthly",
        amount: 250.0,
        active: 1,
        notes: "Electricity, gas, water, internet",
      },
      {
        id: "budget-007",
        category: "Subscriptions",
        period: "Monthly",
        amount: 100.0,
        active: 1,
        notes: "Streaming services, software, memberships",
      },
      {
        id: "budget-008",
        category: "Holiday Fund",
        period: "Yearly",
        amount: 5000.0,
        active: 1,
        notes: "Annual vacation savings",
      },
    ];

    const insertBudget = db.prepare(`
      INSERT INTO budgets (id, category, period, amount, active, notes, last_edited_time)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    for (const budget of budgets) {
      insertBudget.run(
        budget.id,
        budget.category,
        budget.period,
        budget.amount,
        budget.active,
        budget.notes,
        now
      );
    }

    // -------------------------------------------------------------------------
    // Home Inventory
    // -------------------------------------------------------------------------
    const homeInventory = [
      {
        id: "inv-001",
        item_name: "MacBook Pro 16-inch",
        brand: "Apple",
        model: "M3 Max",
        item_id: "C02YX0MJLVDQ",
        room: "Home Office",
        location: "Desk",
        type: "Electronics",
        condition: "Excellent",
        in_use: 1,
        deductible: 1,
        purchase_date: "2024-11-15",
        warranty_expires: "2027-11-15",
        replacement_value: 5499.0,
        resale_value: 4200.0,
        purchase_transaction_id: null,
        purchased_from_id: "10000000-0000-4000-8000-000000000008",
        purchased_from_name: "Apple",
      },
      {
        id: "inv-002",
        item_name: "Sony WH-1000XM5 Headphones",
        brand: "Sony",
        model: "WH-1000XM5",
        item_id: null,
        room: "Home Office",
        location: "Shelf",
        type: "Electronics",
        condition: "Excellent",
        in_use: 1,
        deductible: 1,
        purchase_date: "2026-02-02",
        warranty_expires: "2027-02-02",
        replacement_value: 1299.0,
        resale_value: 900.0,
        purchase_transaction_id: "txn-011",
        purchased_from_id: "10000000-0000-4000-8000-000000000010",
        purchased_from_name: "JB Hi-Fi",
      },
      {
        id: "inv-003",
        item_name: 'Samsung 65" QLED TV',
        brand: "Samsung",
        model: "QN65Q80C",
        item_id: null,
        room: "Living Room",
        location: "Wall Mount",
        type: "Electronics",
        condition: "Good",
        in_use: 1,
        deductible: 1,
        purchase_date: "2023-08-20",
        warranty_expires: "2025-08-20",
        replacement_value: 2799.0,
        resale_value: 1200.0,
        purchase_transaction_id: null,
        purchased_from_id: "10000000-0000-4000-8000-000000000010",
        purchased_from_name: "JB Hi-Fi",
      },
      {
        id: "inv-004",
        item_name: "Dyson V15 Vacuum",
        brand: "Dyson",
        model: "V15 Detect",
        item_id: null,
        room: "Laundry",
        location: "Storage Cupboard",
        type: "Appliance",
        condition: "Good",
        in_use: 1,
        deductible: 0,
        purchase_date: "2024-03-10",
        warranty_expires: "2026-03-10",
        replacement_value: 1249.0,
        resale_value: 750.0,
        purchase_transaction_id: null,
        purchased_from_id: "10000000-0000-4000-8000-000000000006",
        purchased_from_name: "Amazon AU",
      },
      {
        id: "inv-005",
        item_name: "Breville Barista Express",
        brand: "Breville",
        model: "BES870BSS",
        item_id: null,
        room: "Kitchen",
        location: "Counter",
        type: "Appliance",
        condition: "Good",
        in_use: 1,
        deductible: 0,
        purchase_date: "2023-12-01",
        warranty_expires: "2025-12-01",
        replacement_value: 799.0,
        resale_value: 450.0,
        purchase_transaction_id: null,
        purchased_from_id: "10000000-0000-4000-8000-000000000006",
        purchased_from_name: "Amazon AU",
      },
    ];

    const insertInventory = db.prepare(`
      INSERT INTO home_inventory (
        id, item_name, brand, model, item_id, room, location, type, condition,
        in_use, deductible, purchase_date, warranty_expires, replacement_value,
        resale_value, purchase_transaction_id, purchased_from_id, purchased_from_name,
        last_edited_time
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const item of homeInventory) {
      insertInventory.run(
        item.id,
        item.item_name,
        item.brand,
        item.model,
        item.item_id,
        item.room,
        item.location,
        item.type,
        item.condition,
        item.in_use,
        item.deductible,
        item.purchase_date,
        item.warranty_expires,
        item.replacement_value,
        item.resale_value,
        item.purchase_transaction_id,
        item.purchased_from_id,
        item.purchased_from_name,
        now
      );
    }

    // -------------------------------------------------------------------------
    // Wish List
    // -------------------------------------------------------------------------
    const wishList = [
      {
        id: "wish-001",
        item: "New Gaming PC",
        target_amount: 3500.0,
        saved: 1200.0,
        priority: "Soon",
        url: "https://www.pccasegear.com",
        notes: "RTX 4080, Ryzen 9 7950X build",
      },
      {
        id: "wish-002",
        item: "Standing Desk",
        target_amount: 800.0,
        saved: 450.0,
        priority: "Needing",
        url: "https://www.jarvis.com.au",
        notes: "Fully Jarvis bamboo top",
      },
      {
        id: "wish-003",
        item: "Japan Trip",
        target_amount: 8000.0,
        saved: 2100.0,
        priority: "One Day",
        url: null,
        notes: "2 week trip to Tokyo, Kyoto, Osaka",
      },
      {
        id: "wish-004",
        item: "Herman Miller Chair",
        target_amount: 2200.0,
        saved: 0.0,
        priority: "Dreaming",
        url: "https://www.hermanmiller.com",
        notes: "Aeron fully loaded",
      },
      {
        id: "wish-005",
        item: "New Camera",
        target_amount: 4500.0,
        saved: 800.0,
        priority: "One Day",
        url: "https://www.sony.com.au",
        notes: "Sony A7 IV with 24-70mm f/2.8 GM II",
      },
    ];

    const insertWishList = db.prepare(`
      INSERT INTO wish_list (id, item, target_amount, saved, priority, url, notes, last_edited_time)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const wish of wishList) {
      insertWishList.run(
        wish.id,
        wish.item,
        wish.target_amount,
        wish.saved,
        wish.priority,
        wish.url,
        wish.notes,
        now
      );
    }

    console.log(
      `[seeder] Seeded ${entities.length} entities, ${transactions.length} transactions, ` +
        `${budgets.length} budgets, ${homeInventory.length} inventory items, ${wishList.length} wish list items`
    );
  });

  run();
}
