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
    // Clear existing data (order matters for FK constraints)
    // -------------------------------------------------------------------------
    db.exec(`DELETE FROM watch_history`);
    db.exec(`DELETE FROM watchlist`);
    db.exec(`DELETE FROM comparisons`);
    db.exec(`DELETE FROM media_scores`);
    db.exec(`DELETE FROM comparison_dimensions`);
    db.exec(`DELETE FROM episodes`);
    db.exec(`DELETE FROM seasons`);
    db.exec(`DELETE FROM tv_shows`);
    db.exec(`DELETE FROM movies`);
    db.exec(`DELETE FROM item_connections`);
    db.exec(`DELETE FROM item_photos`);
    db.exec(`DELETE FROM home_inventory`);
    db.exec(`DELETE FROM locations`);
    db.exec(`DELETE FROM transactions`);
    db.exec(`DELETE FROM entities`);
    db.exec(`DELETE FROM budgets`);
    db.exec(`DELETE FROM wish_list`);
    db.exec(`DELETE FROM ai_usage`);

    // -------------------------------------------------------------------------
    // Entities
    // -------------------------------------------------------------------------
    const entities = [
      {
        id: "10000000-0000-4000-8000-000000000001",
        name: "Woolworths",
        type: "company",
        abn: "88000014675",
        aliases: "Woolies, WOW, Woolworths Metro",
        default_transaction_type: "Expense",
        default_tags: '["Groceries"]',
        notes: "Primary grocery shopping",
      },
      {
        id: "10000000-0000-4000-8000-000000000002",
        name: "Coles",
        type: "company",
        abn: "45004189708",
        aliases: "Coles Express, Coles Local",
        default_transaction_type: "Expense",
        default_tags: '["Groceries"]',
        notes: null,
      },
      {
        id: "10000000-0000-4000-8000-000000000003",
        name: "Netflix",
        type: "company",
        abn: null,
        aliases: "Netflix.com",
        default_transaction_type: "Expense",
        default_tags: '["Entertainment"]',
        notes: "Streaming service",
      },
      {
        id: "10000000-0000-4000-8000-000000000004",
        name: "Spotify",
        type: "company",
        abn: null,
        aliases: "Spotify Premium",
        default_transaction_type: "Expense",
        default_tags: '["Entertainment"]',
        notes: "Music streaming",
      },
      {
        id: "10000000-0000-4000-8000-000000000005",
        name: "Shell",
        type: "company",
        abn: "46004610459",
        aliases: "Shell Coles Express, Shell Service Station",
        default_transaction_type: "Expense",
        default_tags: '["Transport"]',
        notes: "Fuel and convenience",
      },
      {
        id: "10000000-0000-4000-8000-000000000006",
        name: "Amazon AU",
        type: "company",
        abn: "72054094117",
        aliases: "Amazon.com.au, Amazon Australia",
        default_transaction_type: "Expense",
        default_tags: '["Shopping"]',
        notes: "Online marketplace",
      },
      {
        id: "10000000-0000-4000-8000-000000000007",
        name: "Employer",
        type: "person",
        abn: null,
        aliases: "Salary, Payroll",
        default_transaction_type: "Income",
        default_tags: '["Salary"]',
        notes: "Primary income source",
      },
      {
        id: "10000000-0000-4000-8000-000000000008",
        name: "Apple",
        type: "brand",
        abn: null,
        aliases: "Apple Inc, Apple Store, iTunes",
        default_transaction_type: "Expense",
        default_tags: '["Technology"]',
        notes: null,
      },
      {
        id: "10000000-0000-4000-8000-000000000009",
        name: "Bunnings",
        type: "company",
        abn: "63008672179",
        aliases: "Bunnings Warehouse",
        default_transaction_type: "Expense",
        default_tags: '["Home & Garden"]',
        notes: "Hardware and home improvement",
      },
      {
        id: "10000000-0000-4000-8000-000000000010",
        name: "JB Hi-Fi",
        type: "company",
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
    // Locations (tree structure for inventory items)
    // -------------------------------------------------------------------------
    const locations = [
      // Root locations
      { id: "loc-home", name: "Home", parent_id: null, sort_order: 0 },
      { id: "loc-car", name: "Car", parent_id: null, sort_order: 1 },
      { id: "loc-storage", name: "Storage Cage", parent_id: null, sort_order: 2 },
      // Home children
      { id: "loc-living", name: "Living Room", parent_id: "loc-home", sort_order: 0 },
      { id: "loc-bedroom", name: "Bedroom", parent_id: "loc-home", sort_order: 1 },
      { id: "loc-kitchen", name: "Kitchen", parent_id: "loc-home", sort_order: 2 },
      { id: "loc-office", name: "Office", parent_id: "loc-home", sort_order: 3 },
      { id: "loc-laundry", name: "Laundry", parent_id: "loc-home", sort_order: 4 },
      { id: "loc-balcony", name: "Main Balcony", parent_id: "loc-home", sort_order: 5 },
      // Sub-locations
      { id: "loc-tv-unit", name: "TV Unit", parent_id: "loc-living", sort_order: 0 },
      { id: "loc-bar", name: "Bar", parent_id: "loc-living", sort_order: 1 },
      { id: "loc-wardrobe", name: "Wardrobe Right Door", parent_id: "loc-bedroom", sort_order: 0 },
      { id: "loc-counter", name: "Counter", parent_id: "loc-kitchen", sort_order: 0 },
      { id: "loc-desk", name: "Desk", parent_id: "loc-office", sort_order: 0 },
      { id: "loc-shelf", name: "Shelf", parent_id: "loc-office", sort_order: 1 },
      { id: "loc-cupboard", name: "Storage Cupboard", parent_id: "loc-laundry", sort_order: 0 },
    ];

    const insertLocation = db.prepare(`
      INSERT INTO locations (id, name, parent_id, sort_order, last_edited_time)
      VALUES (?, ?, ?, ?, ?)
    `);

    for (const loc of locations) {
      insertLocation.run(loc.id, loc.name, loc.parent_id, loc.sort_order, now);
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
        asset_id: "MBP-001",
        notes: "Primary work machine. AppleCare+ until 2027.",
        location_id: "loc-desk",
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
        asset_id: "AUDIO-001",
        notes: null,
        location_id: "loc-shelf",
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
        asset_id: "TV-001",
        notes: "Mounted in living room. HDMI 1: Apple TV, HDMI 2: PlayStation.",
        location_id: "loc-tv-unit",
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
        asset_id: null,
        notes: "Wall-mounted charging dock in laundry.",
        location_id: "loc-cupboard",
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
        asset_id: null,
        notes: "Descale monthly. Last descale: 2026-02-15.",
        location_id: "loc-counter",
      },
      // New items
      {
        id: "inv-006",
        item_name: "HDMI Cable 2m",
        brand: "Belkin",
        model: "Ultra HD 2.1",
        item_id: null,
        room: "Living Room",
        location: "TV Unit",
        type: "Cable",
        condition: "Good",
        in_use: 1,
        deductible: 0,
        purchase_date: "2023-08-20",
        warranty_expires: null,
        replacement_value: 39.0,
        resale_value: null,
        purchase_transaction_id: null,
        purchased_from_id: "10000000-0000-4000-8000-000000000010",
        purchased_from_name: "JB Hi-Fi",
        asset_id: "HDMI-001",
        notes: "Connects TV to Apple TV.",
        location_id: "loc-tv-unit",
      },
      {
        id: "inv-007",
        item_name: "Power Board 6-Way",
        brand: "HPM",
        model: "D105/6PAWE",
        item_id: null,
        room: "Living Room",
        location: "TV Unit",
        type: "Electronics",
        condition: "Good",
        in_use: 1,
        deductible: 0,
        purchase_date: "2023-06-01",
        warranty_expires: null,
        replacement_value: 35.0,
        resale_value: null,
        purchase_transaction_id: null,
        purchased_from_id: "10000000-0000-4000-8000-000000000009",
        purchased_from_name: "Bunnings",
        asset_id: "PB-001",
        notes: "Behind TV unit. Powers TV, Apple TV, soundbar.",
        location_id: "loc-tv-unit",
      },
      {
        id: "inv-008",
        item_name: "USB-C Hub",
        brand: "Anker",
        model: "PowerExpand 8-in-1",
        item_id: null,
        room: "Home Office",
        location: "Desk",
        type: "Electronics",
        condition: "Excellent",
        in_use: 1,
        deductible: 1,
        purchase_date: "2024-11-15",
        warranty_expires: "2026-11-15",
        replacement_value: 89.0,
        resale_value: 40.0,
        purchase_transaction_id: null,
        purchased_from_id: "10000000-0000-4000-8000-000000000006",
        purchased_from_name: "Amazon AU",
        asset_id: "HUB-001",
        notes: "Connected to MacBook. HDMI out to monitor.",
        location_id: "loc-desk",
      },
      {
        id: "inv-009",
        item_name: "Ethernet Cable 3m",
        brand: "Cable Matters",
        model: "Cat6a",
        item_id: null,
        room: "Home Office",
        location: "Desk",
        type: "Cable",
        condition: "Good",
        in_use: 1,
        deductible: 0,
        purchase_date: "2024-01-10",
        warranty_expires: null,
        replacement_value: 15.0,
        resale_value: null,
        purchase_transaction_id: null,
        purchased_from_id: "10000000-0000-4000-8000-000000000006",
        purchased_from_name: "Amazon AU",
        asset_id: "ETH-001",
        notes: "Hub to wall socket.",
        location_id: "loc-desk",
      },
      {
        id: "inv-010",
        item_name: "Power Board 4-Way",
        brand: "HPM",
        model: "D105/4PAWE",
        item_id: null,
        room: "Home Office",
        location: "Desk",
        type: "Electronics",
        condition: "Good",
        in_use: 1,
        deductible: 0,
        purchase_date: "2024-11-15",
        warranty_expires: null,
        replacement_value: 25.0,
        resale_value: null,
        purchase_transaction_id: null,
        purchased_from_id: "10000000-0000-4000-8000-000000000009",
        purchased_from_name: "Bunnings",
        asset_id: "PB-002",
        notes: "Under desk. Powers MacBook charger, monitor, hub.",
        location_id: "loc-desk",
      },
    ];

    const insertInventory = db.prepare(`
      INSERT INTO home_inventory (
        id, item_name, brand, model, item_id, room, location, type, condition,
        in_use, deductible, purchase_date, warranty_expires, replacement_value,
        resale_value, purchase_transaction_id, purchased_from_id, purchased_from_name,
        last_edited_time, asset_id, notes, location_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        now,
        item.asset_id,
        item.notes,
        item.location_id
      );
    }

    // -------------------------------------------------------------------------
    // Item Connections (bidirectional links, A<B ordering)
    // -------------------------------------------------------------------------
    const connections = [
      // Power chain: power board → devices
      ["inv-007", "inv-003"], // PB-001 → TV
      // HDMI chain
      ["inv-003", "inv-006"], // TV → HDMI cable
      // Office chain: power board → devices
      ["inv-001", "inv-008"], // MacBook → USB-C Hub
      ["inv-008", "inv-010"], // Hub → Power Board (via charger)
      ["inv-008", "inv-009"], // Hub → Ethernet cable
    ];

    const insertConnection = db.prepare(`
      INSERT INTO item_connections (item_a_id, item_b_id) VALUES (?, ?)
    `);

    for (const [a, b] of connections) {
      // Enforce A < B ordering
      const [lo, hi] = a < b ? [a, b] : [b, a];
      insertConnection.run(lo, hi);
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

    // -------------------------------------------------------------------------
    // Movies
    // -------------------------------------------------------------------------
    const movies = [
      {
        tmdb_id: 278,
        title: "The Shawshank Redemption",
        overview:
          "Imprisoned in the 1940s for the double murder of his wife and her lover, upstanding banker Andy Dufresne begins a new life at the Shawshank prison.",
        release_date: "1994-09-23",
        runtime: 142,
        status: "Released",
        original_language: "en",
        vote_average: 8.7,
        vote_count: 26000,
        genres: '["Drama","Crime"]',
        poster_path: "/9cq9oGvBr8vV0HOf4Uf69TfO8S9.jpg",
        backdrop_path: "/kXfq7j3nBYXoztZ6QT6O9HriI7v.jpg",
      },
      {
        tmdb_id: 238,
        title: "The Godfather",
        overview:
          "Spanning the years 1945 to 1955, a chronicle of the fictional Italian-American Corleone crime family.",
        release_date: "1972-03-14",
        runtime: 175,
        status: "Released",
        original_language: "en",
        vote_average: 8.7,
        vote_count: 20000,
        genres: '["Drama","Crime"]',
        poster_path: "/3bhkrjOiERoSTq9A91In2Y7LpXm.jpg",
        backdrop_path: "/tmU7GeKVZ2uDZZCOREPt7m86ub3.jpg",
      },
      {
        tmdb_id: 155,
        title: "The Dark Knight",
        overview:
          "Batman raises the stakes in his war on crime. With the help of Lt. Jim Gordon and District Attorney Harvey Dent, Batman sets out to dismantle the remaining criminal organizations that plague the streets.",
        release_date: "2008-07-16",
        runtime: 152,
        status: "Released",
        original_language: "en",
        vote_average: 8.5,
        vote_count: 32000,
        genres: '["Drama","Action","Crime","Thriller"]',
        poster_path: "/qJ2PvW9brE7FieldVwaGZp0uX2P.jpg",
        backdrop_path: "/nMK9Szwu260ySbb1oMcIu6YpDoc.jpg",
      },
      {
        tmdb_id: 680,
        title: "Pulp Fiction",
        overview:
          "A burger-loving hit man, his philosophical partner, a drug-addled gangster's moll and a washed-up boxer converge in this sprawling, comedic crime caper.",
        release_date: "1994-09-10",
        runtime: 154,
        status: "Released",
        original_language: "en",
        vote_average: 8.5,
        vote_count: 27000,
        genres: '["Thriller","Crime"]',
        poster_path: "/d5iIl9h9btztU0kzRXR9qUFjwYc.jpg",
        backdrop_path: "/su69mB7W4PkIPq46tS9vC0S9gh8.jpg",
      },
      {
        tmdb_id: 13,
        title: "Forrest Gump",
        overview:
          "A man with a low IQ has accomplished great things in his life and been present during significant historic events — in each case, far exceeding what anyone imagined he could do.",
        release_date: "1994-06-23",
        runtime: 142,
        status: "Released",
        original_language: "en",
        vote_average: 8.5,
        vote_count: 26000,
        genres: '["Comedy","Drama","Romance"]',
        poster_path: "/arw2vcBveWOvMsCMD0STz0nSCDI.jpg",
        backdrop_path: "/qd9p8942lKz3H6F8u7D7i2E2L7m.jpg",
      },
      {
        tmdb_id: 550,
        title: "Fight Club",
        overview:
          "A ticking-time bomb insomniac and a slippery soap salesman channel primal male aggression into a shocking new form of therapy.",
        release_date: "1999-10-15",
        runtime: 139,
        status: "Released",
        original_language: "en",
        vote_average: 8.4,
        vote_count: 28000,
        genres: '["Drama"]',
        poster_path: "/pB8BM7vSc6WL6rsRzfnv3C98U1M.jpg",
        backdrop_path: "/hZ965qFIn6lYyL0vjJdO1OqUjUv.jpg",
      },
      {
        tmdb_id: 120,
        title: "The Lord of the Rings: The Fellowship of the Ring",
        overview:
          "Young hobbit Frodo Baggins, after inheriting a mysterious ring from his uncle Bilbo, must leave his home in order to keep it from falling into the hands of its evil creator.",
        release_date: "2001-12-18",
        runtime: 179,
        status: "Released",
        original_language: "en",
        vote_average: 8.4,
        vote_count: 24000,
        genres: '["Adventure","Fantasy","Action"]',
        poster_path: "/6oom5QYvA1Ssq1Cish9v66fT0bi.jpg",
        backdrop_path: "/vYvUb7v6KMjJhLW6o79q9B957io.jpg",
      },
      {
        tmdb_id: 603,
        title: "The Matrix",
        overview:
          "Set in the 22nd century, The Matrix tells the story of a computer hacker who joins a group of underground insurgents fighting the vast and powerful computers who now rule the earth.",
        release_date: "1999-03-30",
        runtime: 136,
        status: "Released",
        original_language: "en",
        vote_average: 8.2,
        vote_count: 25000,
        genres: '["Action","Science Fiction"]',
        poster_path: "/f89U3Y9SJuCYFJj6ArpZ3sbvhrZ.jpg",
        backdrop_path: "/3u9uL6iPz9D59M37I0mO0D0M8sM.jpg",
      },
      {
        tmdb_id: 157336,
        title: "Interstellar",
        overview:
          "The adventures of a group of explorers who make use of a newly discovered wormhole to surpass the limitations on human space travel and conquer the vast distances involved in an interstellar voyage.",
        release_date: "2014-11-05",
        runtime: 169,
        status: "Released",
        original_language: "en",
        vote_average: 8.4,
        vote_count: 34000,
        genres: '["Adventure","Drama","Science Fiction"]',
        poster_path: "/gEU2QniE6E77NI6vCU67xtiBPzG.jpg",
        backdrop_path: "/xJHtm9C6z2yv3Kq5B6p5H2L0q1s.jpg",
      },
      {
        tmdb_id: 569094,
        title: "Spider-Man: Across the Spider-Verse",
        overview:
          "After reuniting with Gwen Stacy, Brooklyn's full-time, friendly neighborhood Spider-Man is catapulted across the Multiverse.",
        release_date: "2023-05-31",
        runtime: 140,
        status: "Released",
        original_language: "en",
        vote_average: 8.4,
        vote_count: 6500,
        genres: '["Animation","Action","Adventure"]',
        poster_path: "/8Gxv0gSjLSL1R3m9q1SjSygZsgX.jpg",
        backdrop_path: "/4HodYYKEIsS6teju63uDU6L6rO8.jpg",
      },
    ];

    const insertMovie = db.prepare(`
      INSERT INTO movies (
        tmdb_id, title, overview, release_date, runtime, status,
        original_language, vote_average, vote_count, genres,
        poster_path, backdrop_path
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const movie of movies) {
      insertMovie.run(
        movie.tmdb_id,
        movie.title,
        movie.overview,
        movie.release_date,
        movie.runtime,
        movie.status,
        movie.original_language,
        movie.vote_average,
        movie.vote_count,
        movie.genres,
        movie.poster_path,
        movie.backdrop_path
      );
    }

    // -------------------------------------------------------------------------
    // TV Shows
    // -------------------------------------------------------------------------
    const tvShowsData = [
      {
        tvdb_id: 81189,
        name: "Breaking Bad",
        overview:
          "A high school chemistry teacher diagnosed with inoperable lung cancer turns to manufacturing and selling methamphetamine in order to secure his family's future.",
        first_air_date: "2008-01-20",
        last_air_date: "2013-09-29",
        status: "Ended",
        original_language: "en",
        number_of_seasons: 5,
        number_of_episodes: 62,
        episode_run_time: 47,
        vote_average: 8.9,
        vote_count: 13000,
        genres: '["Drama","Crime"]',
        networks: '["AMC"]',
        poster_path: "https://artworks.thetvdb.com/artworks/posters/81189-1.jpg",
        backdrop_path: "https://artworks.thetvdb.com/artworks/fanart/81189-1.jpg",
      },
      {
        tvdb_id: 305288,
        name: "Severance",
        overview:
          "Mark leads a team of office workers whose memories have been surgically divided between their work and personal lives.",
        first_air_date: "2022-02-18",
        last_air_date: null,
        status: "Returning Series",
        original_language: "en",
        number_of_seasons: 2,
        number_of_episodes: 19,
        episode_run_time: 50,
        vote_average: 8.4,
        vote_count: 3000,
        genres: '["Drama","Mystery","Science Fiction"]',
        networks: '["Apple TV+"]',
        poster_path: "https://artworks.thetvdb.com/artworks/posters/305288-2.jpg",
        backdrop_path: "https://artworks.thetvdb.com/artworks/fanart/305288-1.jpg",
      },
      {
        tvdb_id: 366924,
        name: "Shogun",
        overview:
          "In Japan in the year 1600, at the dawn of a century-defining civil war, Lord Yoshii Toranaga is fighting for his life as his enemies on the Council of Regents unite against him.",
        first_air_date: "2024-02-27",
        last_air_date: null,
        status: "Returning Series",
        original_language: "en",
        number_of_seasons: 1,
        number_of_episodes: 10,
        episode_run_time: 60,
        vote_average: 8.7,
        vote_count: 2500,
        genres: '["Drama","War & Politics"]',
        networks: '["FX"]',
        poster_path: "https://artworks.thetvdb.com/artworks/posters/366924-1.jpg",
        backdrop_path: "https://artworks.thetvdb.com/artworks/fanart/366924-1.jpg",
      },
    ];

    const insertTvShow = db.prepare(`
      INSERT INTO tv_shows (
        tvdb_id, name, overview, first_air_date, last_air_date, status,
        original_language, number_of_seasons, number_of_episodes, episode_run_time,
        vote_average, vote_count, genres, networks,
        poster_path, backdrop_path
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const tvShowIds: number[] = [];
    for (const show of tvShowsData) {
      const result = insertTvShow.run(
        show.tvdb_id,
        show.name,
        show.overview,
        show.first_air_date,
        show.last_air_date,
        show.status,
        show.original_language,
        show.number_of_seasons,
        show.number_of_episodes,
        show.episode_run_time,
        show.vote_average,
        show.vote_count,
        show.genres,
        show.networks,
        show.poster_path,
        show.backdrop_path
      );
      tvShowIds.push(Number(result.lastInsertRowid));
    }

    // -------------------------------------------------------------------------
    // Seasons & Episodes
    // -------------------------------------------------------------------------
    const insertSeason = db.prepare(`
      INSERT INTO seasons (tv_show_id, tvdb_id, season_number, name, episode_count)
      VALUES (?, ?, ?, ?, ?)
    `);

    const insertEpisode = db.prepare(`
      INSERT INTO episodes (season_id, tvdb_id, episode_number, name, runtime)
      VALUES (?, ?, ?, ?, ?)
    `);

    // Breaking Bad — seasons 1 & 5
    const bbS1 = Number(insertSeason.run(tvShowIds[0], 30272, 1, "Season 1", 7).lastInsertRowid);
    insertEpisode.run(bbS1, 349232, 1, "Pilot", 58);
    insertEpisode.run(bbS1, 349233, 2, "Cat's in the Bag...", 48);
    insertEpisode.run(bbS1, 349234, 3, "...And the Bag's in the River", 48);

    const bbS5 = Number(insertSeason.run(tvShowIds[0], 488434, 5, "Season 5", 16).lastInsertRowid);
    insertEpisode.run(bbS5, 4161693, 1, "Live Free or Die", 47);
    insertEpisode.run(bbS5, 4161694, 2, "Madrigal", 47);
    insertEpisode.run(bbS5, 4529635, 9, "Blood Money", 47);
    insertEpisode.run(bbS5, 4649411, 16, "Felina", 55);

    // Severance — seasons 1 & 2
    const sevS1 = Number(insertSeason.run(tvShowIds[1], 1893498, 1, "Season 1", 9).lastInsertRowid);
    insertEpisode.run(sevS1, 8361124, 1, "Good News About Hell", 57);
    insertEpisode.run(sevS1, 8400665, 2, "Half Loop", 51);
    insertEpisode.run(sevS1, 8786314, 9, "The We We Are", 42);

    const sevS2 = Number(
      insertSeason.run(tvShowIds[1], 2145611, 2, "Season 2", 10).lastInsertRowid
    );
    insertEpisode.run(sevS2, 10337005, 1, "Hello, Ms. Cobel", 56);
    insertEpisode.run(sevS2, 10337006, 2, "Goodbye, Mrs. Selvig", 49);
    insertEpisode.run(sevS2, 10337013, 10, "Cold Harbor", 72);

    // Shogun — season 1
    const shoS1 = Number(
      insertSeason.run(tvShowIds[2], 2043811, 1, "Season 1", 10).lastInsertRowid
    );
    insertEpisode.run(shoS1, 9784549, 1, "Anjin", 70);
    insertEpisode.run(shoS1, 9784550, 2, "Servants of Two Masters", 55);
    insertEpisode.run(shoS1, 9784558, 10, "A Dream of a Dream", 70);

    // Count totals for log
    const seasonCount = 5;
    const episodeCount = 16;

    console.log(
      `[seeder] Seeded ${entities.length} entities, ${transactions.length} transactions, ` +
        `${budgets.length} budgets, ${homeInventory.length} inventory items, ${wishList.length} wish list items, ` +
        `${movies.length} movies, ${tvShowsData.length} tv shows, ${seasonCount} seasons, ${episodeCount} episodes, ` +
        `${locations.length} locations, ${connections.length} connections`
    );
  });

  run();
}
