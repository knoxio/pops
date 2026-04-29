import { deleteAllApplicationRows, seedBareMinimum } from './data-reset.js';

/**
 * Database seeder — inserts test/development data.
 * Exported as a function so it can be called programmatically
 * (e.g. from the env management system when seeding a new environment).
 */
import type BetterSqlite3 from 'better-sqlite3';

/**
 * Seed a database with test data.
 * Clears all existing data first, then inserts records atomically.
 * Safe to call on any database that has the full schema applied.
 */
export function seedDatabase(db: BetterSqlite3.Database): void {
  const now = new Date().toISOString();

  db.pragma('foreign_keys = OFF');
  try {
    db.transaction(() => {
      deleteAllApplicationRows(db);
      seedBareMinimum(db);

      // -------------------------------------------------------------------------
      // Entities
      // -------------------------------------------------------------------------
      const entities = [
        {
          id: '10000000-0000-4000-8000-000000000001',
          name: 'Woolworths',
          type: 'company',
          abn: '88000014675',
          aliases: 'Woolies, WOW, Woolworths Metro',
          default_transaction_type: 'Expense',
          default_tags: '["Groceries"]',
          notes: 'Primary grocery shopping',
        },
        {
          id: '10000000-0000-4000-8000-000000000002',
          name: 'Coles',
          type: 'company',
          abn: '45004189708',
          aliases: 'Coles Express, Coles Local',
          default_transaction_type: 'Expense',
          default_tags: '["Groceries"]',
          notes: null,
        },
        {
          id: '10000000-0000-4000-8000-000000000003',
          name: 'Netflix',
          type: 'company',
          abn: null,
          aliases: 'Netflix.com',
          default_transaction_type: 'Expense',
          default_tags: '["Entertainment"]',
          notes: 'Streaming service',
        },
        {
          id: '10000000-0000-4000-8000-000000000004',
          name: 'Spotify',
          type: 'company',
          abn: null,
          aliases: 'Spotify Premium',
          default_transaction_type: 'Expense',
          default_tags: '["Entertainment"]',
          notes: 'Music streaming',
        },
        {
          id: '10000000-0000-4000-8000-000000000005',
          name: 'Shell',
          type: 'company',
          abn: '46004610459',
          aliases: 'Shell Coles Express, Shell Service Station',
          default_transaction_type: 'Expense',
          default_tags: '["Transport"]',
          notes: 'Fuel and convenience',
        },
        {
          id: '10000000-0000-4000-8000-000000000006',
          name: 'Amazon AU',
          type: 'company',
          abn: '72054094117',
          aliases: 'Amazon.com.au, Amazon Australia',
          default_transaction_type: 'Expense',
          default_tags: '["Shopping"]',
          notes: 'Online marketplace',
        },
        {
          id: '10000000-0000-4000-8000-000000000007',
          name: 'Employer',
          type: 'person',
          abn: null,
          aliases: 'Salary, Payroll',
          default_transaction_type: 'Income',
          default_tags: '["Salary"]',
          notes: 'Primary income source',
        },
        {
          id: '10000000-0000-4000-8000-000000000008',
          name: 'Apple',
          type: 'brand',
          abn: null,
          aliases: 'Apple Inc, Apple Store, iTunes',
          default_transaction_type: 'Expense',
          default_tags: '["Technology"]',
          notes: null,
        },
        {
          id: '10000000-0000-4000-8000-000000000009',
          name: 'Bunnings',
          type: 'company',
          abn: '63008672179',
          aliases: 'Bunnings Warehouse',
          default_transaction_type: 'Expense',
          default_tags: '["Home & Garden"]',
          notes: 'Hardware and home improvement',
        },
        {
          id: '10000000-0000-4000-8000-000000000010',
          name: 'JB Hi-Fi',
          type: 'company',
          abn: '98093220136',
          aliases: 'JB HiFi, JB',
          default_transaction_type: 'Expense',
          default_tags: '["Technology"]',
          notes: 'Electronics retailer',
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
          id: 'txn-001',
          description: 'Salary Payment',
          account: 'Bank Account',
          amount: 5200.0,
          date: '2026-02-01',
          type: 'Income',
          tags: JSON.stringify(['Salary']),
          entity_id: '10000000-0000-4000-8000-000000000007',
          entity_name: 'Employer',
          location: null,
          country: 'Australia',
          related_transaction_id: null,
          notes: 'Fortnightly salary',
        },
        {
          id: 'txn-002',
          description: 'Salary Payment',
          account: 'Bank Account',
          amount: 5200.0,
          date: '2026-01-18',
          type: 'Income',
          tags: JSON.stringify(['Salary']),
          entity_id: '10000000-0000-4000-8000-000000000007',
          entity_name: 'Employer',
          location: null,
          country: 'Australia',
          related_transaction_id: null,
          notes: 'Fortnightly salary',
        },
        // Groceries
        {
          id: 'txn-003',
          description: 'Woolworths Metro',
          account: 'Credit Card',
          amount: -87.45,
          date: '2026-02-10',
          type: 'Expense',
          tags: JSON.stringify(['Groceries']),
          entity_id: '10000000-0000-4000-8000-000000000001',
          entity_name: 'Woolworths',
          location: 'Sydney CBD',
          country: 'Australia',
          related_transaction_id: null,
          notes: null,
        },
        {
          id: 'txn-004',
          description: 'Coles Local',
          account: 'Debit Card',
          amount: -124.8,
          date: '2026-02-08',
          type: 'Expense',
          tags: JSON.stringify(['Groceries']),
          entity_id: '10000000-0000-4000-8000-000000000002',
          entity_name: 'Coles',
          location: 'Surry Hills',
          country: 'Australia',
          related_transaction_id: null,
          notes: 'Weekly shop',
        },
        {
          id: 'txn-005',
          description: 'Woolworths',
          account: 'Credit Card',
          amount: -156.32,
          date: '2026-02-03',
          type: 'Expense',
          tags: JSON.stringify(['Groceries']),
          entity_id: '10000000-0000-4000-8000-000000000001',
          entity_name: 'Woolworths',
          location: 'Bondi Junction',
          country: 'Australia',
          related_transaction_id: null,
          notes: null,
        },
        // Subscriptions
        {
          id: 'txn-006',
          description: 'Netflix Subscription',
          account: 'Credit Card',
          amount: -22.99,
          date: '2026-02-05',
          type: 'Expense',
          tags: JSON.stringify(['Entertainment', 'Subscriptions']),
          entity_id: '10000000-0000-4000-8000-000000000003',
          entity_name: 'Netflix',
          location: null,
          country: 'Australia',
          related_transaction_id: null,
          notes: 'Premium plan',
        },
        {
          id: 'txn-007',
          description: 'Spotify Premium',
          account: 'Credit Card',
          amount: -13.99,
          date: '2026-02-01',
          type: 'Expense',
          tags: JSON.stringify(['Entertainment', 'Subscriptions']),
          entity_id: '10000000-0000-4000-8000-000000000004',
          entity_name: 'Spotify',
          location: null,
          country: 'Australia',
          related_transaction_id: null,
          notes: 'Individual plan',
        },
        // Fuel
        {
          id: 'txn-008',
          description: 'Shell Service Station',
          account: 'Credit Card',
          amount: -75.5,
          date: '2026-02-07',
          type: 'Expense',
          tags: JSON.stringify(['Transport', 'Fuel']),
          entity_id: '10000000-0000-4000-8000-000000000005',
          entity_name: 'Shell',
          location: 'Randwick',
          country: 'Australia',
          related_transaction_id: null,
          notes: '45L unleaded',
        },
        {
          id: 'txn-009',
          description: 'Shell Coles Express',
          account: 'Credit Card',
          amount: -68.2,
          date: '2026-01-28',
          type: 'Expense',
          tags: JSON.stringify(['Transport', 'Fuel']),
          entity_id: '10000000-0000-4000-8000-000000000005',
          entity_name: 'Shell',
          location: 'Mascot',
          country: 'Australia',
          related_transaction_id: null,
          notes: null,
        },
        // Shopping
        {
          id: 'txn-010',
          description: 'Amazon.com.au',
          account: 'Credit Card',
          amount: -89.95,
          date: '2026-02-04',
          type: 'Expense',
          tags: JSON.stringify(['Shopping', 'Technology']),
          entity_id: '10000000-0000-4000-8000-000000000006',
          entity_name: 'Amazon AU',
          location: null,
          country: 'Australia',
          related_transaction_id: null,
          notes: 'USB-C cables and phone case',
        },
        {
          id: 'txn-011',
          description: 'JB Hi-Fi',
          account: 'Credit Card',
          amount: -1299.0,
          date: '2026-02-02',
          type: 'Expense',
          tags: JSON.stringify(['Technology', 'Shopping']),
          entity_id: '10000000-0000-4000-8000-000000000010',
          entity_name: 'JB Hi-Fi',
          location: 'Pitt St Mall',
          country: 'Australia',
          related_transaction_id: null,
          notes: 'New headphones - Sony WH-1000XM5',
        },
        {
          id: 'txn-012',
          description: 'Bunnings Warehouse',
          account: 'Debit Card',
          amount: -147.6,
          date: '2026-01-30',
          type: 'Expense',
          tags: JSON.stringify(['Home & Garden']),
          entity_id: '10000000-0000-4000-8000-000000000009',
          entity_name: 'Bunnings',
          location: 'Alexandria',
          country: 'Australia',
          related_transaction_id: null,
          notes: 'Paint supplies for bedroom',
        },
        // Transfer pair
        {
          id: 'txn-013',
          description: 'Transfer to Savings',
          account: 'Bank Account',
          amount: -500.0,
          date: '2026-02-01',
          type: 'Transfer',
          tags: JSON.stringify(['Transfer']),
          entity_id: null,
          entity_name: null,
          location: null,
          country: 'Australia',
          related_transaction_id: 'txn-014',
          notes: 'Monthly savings',
        },
        {
          id: 'txn-014',
          description: 'Transfer from Bank Account',
          account: 'Savings Account',
          amount: 500.0,
          date: '2026-02-01',
          type: 'Transfer',
          tags: JSON.stringify(['Transfer']),
          entity_id: null,
          entity_name: null,
          location: null,
          country: 'Australia',
          related_transaction_id: 'txn-013',
          notes: 'Monthly savings',
        },
        // Historical
        {
          id: 'txn-015',
          description: 'Salary Payment',
          account: 'Bank Account',
          amount: 5200.0,
          date: '2026-01-04',
          type: 'Income',
          tags: JSON.stringify(['Salary']),
          entity_id: '10000000-0000-4000-8000-000000000007',
          entity_name: 'Employer',
          location: null,
          country: 'Australia',
          related_transaction_id: null,
          notes: 'Fortnightly salary',
        },
        {
          id: 'txn-016',
          description: 'Woolworths',
          account: 'Credit Card',
          amount: -203.45,
          date: '2025-12-28',
          type: 'Expense',
          tags: JSON.stringify(['Groceries']),
          entity_id: '10000000-0000-4000-8000-000000000001',
          entity_name: 'Woolworths',
          location: 'Sydney CBD',
          country: 'Australia',
          related_transaction_id: null,
          notes: 'Holiday shopping',
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
          id: 'budget-001',
          category: 'Groceries',
          period: 'Monthly',
          amount: 800.0,
          active: 1,
          notes: 'Supermarket shopping and essentials',
        },
        {
          id: 'budget-002',
          category: 'Transport',
          period: 'Monthly',
          amount: 300.0,
          active: 1,
          notes: 'Fuel, tolls, parking',
        },
        {
          id: 'budget-003',
          category: 'Entertainment',
          period: 'Monthly',
          amount: 150.0,
          active: 1,
          notes: 'Streaming, dining out, activities',
        },
        {
          id: 'budget-004',
          category: 'Shopping',
          period: 'Monthly',
          amount: 400.0,
          active: 1,
          notes: 'Clothing, electronics, misc purchases',
        },
        {
          id: 'budget-005',
          category: 'Home & Garden',
          period: 'Monthly',
          amount: 200.0,
          active: 1,
          notes: 'Maintenance, improvements, supplies',
        },
        {
          id: 'budget-006',
          category: 'Utilities',
          period: 'Monthly',
          amount: 250.0,
          active: 1,
          notes: 'Electricity, gas, water, internet',
        },
        {
          id: 'budget-007',
          category: 'Subscriptions',
          period: 'Monthly',
          amount: 100.0,
          active: 1,
          notes: 'Streaming services, software, memberships',
        },
        {
          id: 'budget-008',
          category: 'Holiday Fund',
          period: 'Yearly',
          amount: 5000.0,
          active: 1,
          notes: 'Annual vacation savings',
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
        { id: 'loc-home', name: 'Home', parent_id: null, sort_order: 0 },
        { id: 'loc-car', name: 'Car', parent_id: null, sort_order: 1 },
        { id: 'loc-storage', name: 'Storage Cage', parent_id: null, sort_order: 2 },
        // Home children
        { id: 'loc-living', name: 'Living Room', parent_id: 'loc-home', sort_order: 0 },
        { id: 'loc-bedroom', name: 'Bedroom', parent_id: 'loc-home', sort_order: 1 },
        { id: 'loc-kitchen', name: 'Kitchen', parent_id: 'loc-home', sort_order: 2 },
        { id: 'loc-office', name: 'Office', parent_id: 'loc-home', sort_order: 3 },
        { id: 'loc-laundry', name: 'Laundry', parent_id: 'loc-home', sort_order: 4 },
        { id: 'loc-balcony', name: 'Main Balcony', parent_id: 'loc-home', sort_order: 5 },
        // Sub-locations (Home)
        { id: 'loc-tv-unit', name: 'TV Unit', parent_id: 'loc-living', sort_order: 0 },
        { id: 'loc-bar', name: 'Bar', parent_id: 'loc-living', sort_order: 1 },
        {
          id: 'loc-wardrobe',
          name: 'Wardrobe Right Door',
          parent_id: 'loc-bedroom',
          sort_order: 0,
        },
        { id: 'loc-nightstand', name: 'Nightstand', parent_id: 'loc-bedroom', sort_order: 1 },
        { id: 'loc-counter', name: 'Counter', parent_id: 'loc-kitchen', sort_order: 0 },
        { id: 'loc-pantry', name: 'Pantry', parent_id: 'loc-kitchen', sort_order: 1 },
        { id: 'loc-desk', name: 'Desk', parent_id: 'loc-office', sort_order: 0 },
        { id: 'loc-shelf', name: 'Shelf', parent_id: 'loc-office', sort_order: 1 },
        { id: 'loc-cabinet', name: 'Cabinet', parent_id: 'loc-office', sort_order: 2 },
        { id: 'loc-cupboard', name: 'Storage Cupboard', parent_id: 'loc-laundry', sort_order: 0 },
        // Sub-locations (Car)
        { id: 'loc-car-boot', name: 'Boot', parent_id: 'loc-car', sort_order: 0 },
        { id: 'loc-car-glovebox', name: 'Glovebox', parent_id: 'loc-car', sort_order: 1 },
        // Sub-locations (Storage Cage)
        { id: 'loc-cage-shelf1', name: 'Shelf 1', parent_id: 'loc-storage', sort_order: 0 },
        { id: 'loc-cage-shelf2', name: 'Shelf 2', parent_id: 'loc-storage', sort_order: 1 },
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
          id: 'inv-001',
          item_name: 'MacBook Pro 16-inch',
          brand: 'Apple',
          model: 'M3 Max',
          item_id: 'C02YX0MJLVDQ',
          room: 'Home Office',
          location: 'Desk',
          type: 'Electronics',
          condition: 'Excellent',
          in_use: 1,
          deductible: 1,
          purchase_date: '2024-11-15',
          warranty_expires: '2027-11-15',
          replacement_value: 5499.0,
          resale_value: 4200.0,
          purchase_transaction_id: null,
          purchased_from_id: '10000000-0000-4000-8000-000000000008',
          purchased_from_name: 'Apple',
          asset_id: 'MBP-001',
          notes: 'Primary work machine. AppleCare+ until 2027.',
          location_id: 'loc-desk',
        },
        {
          id: 'inv-002',
          item_name: 'Sony WH-1000XM5 Headphones',
          brand: 'Sony',
          model: 'WH-1000XM5',
          item_id: null,
          room: 'Home Office',
          location: 'Shelf',
          type: 'Electronics',
          condition: 'Excellent',
          in_use: 1,
          deductible: 1,
          purchase_date: '2026-02-02',
          warranty_expires: '2027-02-02',
          replacement_value: 1299.0,
          resale_value: 900.0,
          purchase_transaction_id: 'txn-011',
          purchased_from_id: '10000000-0000-4000-8000-000000000010',
          purchased_from_name: 'JB Hi-Fi',
          asset_id: 'AUDIO-001',
          notes: null,
          location_id: 'loc-shelf',
        },
        {
          id: 'inv-003',
          item_name: 'Samsung 65" QLED TV',
          brand: 'Samsung',
          model: 'QN65Q80C',
          item_id: null,
          room: 'Living Room',
          location: 'Wall Mount',
          type: 'Electronics',
          condition: 'Good',
          in_use: 1,
          deductible: 1,
          purchase_date: '2023-08-20',
          warranty_expires: '2025-08-20',
          replacement_value: 2799.0,
          resale_value: 1200.0,
          purchase_transaction_id: null,
          purchased_from_id: '10000000-0000-4000-8000-000000000010',
          purchased_from_name: 'JB Hi-Fi',
          asset_id: 'TV-001',
          notes: 'Mounted in living room. HDMI 1: Apple TV, HDMI 2: PlayStation.',
          location_id: 'loc-tv-unit',
        },
        {
          id: 'inv-004',
          item_name: 'Dyson V15 Vacuum',
          brand: 'Dyson',
          model: 'V15 Detect',
          item_id: null,
          room: 'Laundry',
          location: 'Storage Cupboard',
          type: 'Appliance',
          condition: 'Good',
          in_use: 1,
          deductible: 0,
          purchase_date: '2024-03-10',
          warranty_expires: '2026-03-10',
          replacement_value: 1249.0,
          resale_value: 750.0,
          purchase_transaction_id: null,
          purchased_from_id: '10000000-0000-4000-8000-000000000006',
          purchased_from_name: 'Amazon AU',
          asset_id: null,
          notes: 'Wall-mounted charging dock in laundry.',
          location_id: 'loc-cupboard',
        },
        {
          id: 'inv-005',
          item_name: 'Breville Barista Express',
          brand: 'Breville',
          model: 'BES870BSS',
          item_id: null,
          room: 'Kitchen',
          location: 'Counter',
          type: 'Appliance',
          condition: 'Good',
          in_use: 1,
          deductible: 0,
          purchase_date: '2023-12-01',
          warranty_expires: '2025-12-01',
          replacement_value: 799.0,
          resale_value: 450.0,
          purchase_transaction_id: null,
          purchased_from_id: '10000000-0000-4000-8000-000000000006',
          purchased_from_name: 'Amazon AU',
          asset_id: null,
          notes: 'Descale monthly. Last descale: 2026-02-15.',
          location_id: 'loc-counter',
        },
        // New items
        {
          id: 'inv-006',
          item_name: 'HDMI Cable 2m',
          brand: 'Belkin',
          model: 'Ultra HD 2.1',
          item_id: null,
          room: 'Living Room',
          location: 'TV Unit',
          type: 'Cable',
          condition: 'Good',
          in_use: 1,
          deductible: 0,
          purchase_date: '2023-08-20',
          warranty_expires: null,
          replacement_value: 39.0,
          resale_value: null,
          purchase_transaction_id: null,
          purchased_from_id: '10000000-0000-4000-8000-000000000010',
          purchased_from_name: 'JB Hi-Fi',
          asset_id: 'HDMI-001',
          notes: 'Connects TV to Apple TV.',
          location_id: 'loc-tv-unit',
        },
        {
          id: 'inv-007',
          item_name: 'Power Board 6-Way',
          brand: 'HPM',
          model: 'D105/6PAWE',
          item_id: null,
          room: 'Living Room',
          location: 'TV Unit',
          type: 'Electronics',
          condition: 'Good',
          in_use: 1,
          deductible: 0,
          purchase_date: '2023-06-01',
          warranty_expires: null,
          replacement_value: 35.0,
          resale_value: null,
          purchase_transaction_id: null,
          purchased_from_id: '10000000-0000-4000-8000-000000000009',
          purchased_from_name: 'Bunnings',
          asset_id: 'PB-001',
          notes: 'Behind TV unit. Powers TV, Apple TV, soundbar.',
          location_id: 'loc-tv-unit',
        },
        {
          id: 'inv-008',
          item_name: 'USB-C Hub',
          brand: 'Anker',
          model: 'PowerExpand 8-in-1',
          item_id: null,
          room: 'Home Office',
          location: 'Desk',
          type: 'Electronics',
          condition: 'Excellent',
          in_use: 1,
          deductible: 1,
          purchase_date: '2024-11-15',
          warranty_expires: '2026-11-15',
          replacement_value: 89.0,
          resale_value: 40.0,
          purchase_transaction_id: null,
          purchased_from_id: '10000000-0000-4000-8000-000000000006',
          purchased_from_name: 'Amazon AU',
          asset_id: 'HUB-001',
          notes: 'Connected to MacBook. HDMI out to monitor.',
          location_id: 'loc-desk',
        },
        {
          id: 'inv-009',
          item_name: 'Ethernet Cable 3m',
          brand: 'Cable Matters',
          model: 'Cat6a',
          item_id: null,
          room: 'Home Office',
          location: 'Desk',
          type: 'Cable',
          condition: 'Good',
          in_use: 1,
          deductible: 0,
          purchase_date: '2024-01-10',
          warranty_expires: null,
          replacement_value: 15.0,
          resale_value: null,
          purchase_transaction_id: null,
          purchased_from_id: '10000000-0000-4000-8000-000000000006',
          purchased_from_name: 'Amazon AU',
          asset_id: 'ETH-001',
          notes: 'Hub to wall socket.',
          location_id: 'loc-desk',
        },
        {
          id: 'inv-010',
          item_name: 'Power Board 4-Way',
          brand: 'HPM',
          model: 'D105/4PAWE',
          item_id: null,
          room: 'Home Office',
          location: 'Desk',
          type: 'Electronics',
          condition: 'Good',
          in_use: 1,
          deductible: 0,
          purchase_date: '2024-11-15',
          warranty_expires: null,
          replacement_value: 25.0,
          resale_value: null,
          purchase_transaction_id: null,
          purchased_from_id: '10000000-0000-4000-8000-000000000009',
          purchased_from_name: 'Bunnings',
          asset_id: 'PB-002',
          notes: 'Under desk. Powers MacBook charger, monitor, hub.',
          location_id: 'loc-desk',
        },
        // Furniture
        {
          id: 'inv-011',
          item_name: 'Standing Desk',
          brand: 'Desky',
          model: 'Dual Ergo Edge',
          item_id: null,
          room: 'Home Office',
          location: 'Office',
          type: 'Furniture',
          condition: 'Excellent',
          in_use: 1,
          deductible: 1,
          purchase_date: '2024-10-01',
          warranty_expires: '2029-10-01',
          replacement_value: 899.0,
          resale_value: 500.0,
          purchase_transaction_id: null,
          purchased_from_id: null,
          purchased_from_name: 'Desky',
          asset_id: 'DESK-001',
          notes: 'Height adjustable. Memory presets: 72cm sit, 110cm stand.',
          location_id: 'loc-office',
        },
        {
          id: 'inv-012',
          item_name: 'Ergonomic Chair',
          brand: 'Herman Miller',
          model: 'Aeron Size B',
          item_id: null,
          room: 'Home Office',
          location: 'Office',
          type: 'Furniture',
          condition: 'Good',
          in_use: 1,
          deductible: 1,
          purchase_date: '2022-06-15',
          warranty_expires: '2034-06-15',
          replacement_value: 2195.0,
          resale_value: 1400.0,
          purchase_transaction_id: null,
          purchased_from_id: null,
          purchased_from_name: 'Herman Miller',
          asset_id: 'CHAIR-001',
          notes: '12-year warranty. Lumbar support adjusted.',
          location_id: 'loc-office',
        },
        // Tools
        {
          id: 'inv-013',
          item_name: 'Drill Driver Kit',
          brand: 'Makita',
          model: 'DHP486',
          item_id: null,
          room: 'Storage Cage',
          location: 'Shelf 1',
          type: 'Tools',
          condition: 'Good',
          in_use: 1,
          deductible: 0,
          purchase_date: '2023-03-20',
          warranty_expires: '2026-03-20',
          replacement_value: 349.0,
          resale_value: 200.0,
          purchase_transaction_id: null,
          purchased_from_id: '10000000-0000-4000-8000-000000000009',
          purchased_from_name: 'Bunnings',
          asset_id: 'TOOL-001',
          notes: 'Includes 2x 5.0Ah batteries and charger.',
          location_id: 'loc-cage-shelf1',
        },
        {
          id: 'inv-014',
          item_name: 'Socket Set 94pc',
          brand: 'Stanley',
          model: 'STMT74394',
          item_id: null,
          room: 'Storage Cage',
          location: 'Shelf 1',
          type: 'Tools',
          condition: 'Good',
          in_use: 1,
          deductible: 0,
          purchase_date: '2022-01-10',
          warranty_expires: null,
          replacement_value: 129.0,
          resale_value: 60.0,
          purchase_transaction_id: null,
          purchased_from_id: '10000000-0000-4000-8000-000000000009',
          purchased_from_name: 'Bunnings',
          asset_id: 'TOOL-002',
          notes: null,
          location_id: 'loc-cage-shelf1',
        },
        // Sports
        {
          id: 'inv-015',
          item_name: 'Road Bike',
          brand: 'Giant',
          model: 'Defy Advanced 2',
          item_id: null,
          room: 'Storage Cage',
          location: 'Shelf 2',
          type: 'Sports',
          condition: 'Good',
          in_use: 1,
          deductible: 1,
          purchase_date: '2023-09-01',
          warranty_expires: null,
          replacement_value: 3299.0,
          resale_value: 2000.0,
          purchase_transaction_id: null,
          purchased_from_id: null,
          purchased_from_name: 'Giant Store',
          asset_id: 'BIKE-001',
          notes: 'Last service: 2026-01-15. Size M/L.',
          location_id: 'loc-cage-shelf2',
        },
        {
          id: 'inv-016',
          item_name: 'Bike Helmet',
          brand: 'Giro',
          model: 'Synthe MIPS',
          item_id: null,
          room: 'Storage Cage',
          location: 'Shelf 2',
          type: 'Sports',
          condition: 'Fair',
          in_use: 1,
          deductible: 0,
          purchase_date: '2023-09-01',
          warranty_expires: null,
          replacement_value: 249.0,
          resale_value: null,
          purchase_transaction_id: null,
          purchased_from_id: null,
          purchased_from_name: 'Giant Store',
          asset_id: null,
          notes: 'Replace after 3 years or any impact.',
          location_id: 'loc-cage-shelf2',
        },
        // Clothing
        {
          id: 'inv-017',
          item_name: 'Winter Jacket',
          brand: 'Patagonia',
          model: 'Nano Puff',
          item_id: null,
          room: 'Bedroom',
          location: 'Wardrobe Right Door',
          type: 'Clothing',
          condition: 'Excellent',
          in_use: 1,
          deductible: 0,
          purchase_date: '2025-05-10',
          warranty_expires: null,
          replacement_value: 349.0,
          resale_value: 150.0,
          purchase_transaction_id: null,
          purchased_from_id: null,
          purchased_from_name: 'Patagonia',
          asset_id: null,
          notes: 'Size M. Machine washable.',
          location_id: 'loc-wardrobe',
        },
        // Car items
        {
          id: 'inv-018',
          item_name: 'Emergency Kit',
          brand: 'NRMA',
          model: 'Roadside Kit',
          item_id: null,
          room: 'Car',
          location: 'Boot',
          type: 'Other',
          condition: 'Good',
          in_use: 1,
          deductible: 0,
          purchase_date: '2024-06-01',
          warranty_expires: null,
          replacement_value: 89.0,
          resale_value: null,
          purchase_transaction_id: null,
          purchased_from_id: null,
          purchased_from_name: 'NRMA',
          asset_id: null,
          notes: 'First aid, jumper cables, torch, reflective triangle.',
          location_id: 'loc-car-boot',
        },
        // More electronics — bedroom
        {
          id: 'inv-019',
          item_name: 'iPad Air',
          brand: 'Apple',
          model: 'M2 11-inch',
          item_id: null,
          room: 'Bedroom',
          location: 'Nightstand',
          type: 'Electronics',
          condition: 'Excellent',
          in_use: 1,
          deductible: 1,
          purchase_date: '2025-10-20',
          warranty_expires: '2027-10-20',
          replacement_value: 999.0,
          resale_value: 700.0,
          purchase_transaction_id: null,
          purchased_from_id: '10000000-0000-4000-8000-000000000008',
          purchased_from_name: 'Apple',
          asset_id: 'IPAD-001',
          notes: 'WiFi model. 256GB. Used for reading and streaming.',
          location_id: 'loc-nightstand',
        },
        // Balcony
        {
          id: 'inv-020',
          item_name: 'Outdoor Table Set',
          brand: 'Kmart',
          model: 'Acacia 3pc',
          item_id: null,
          room: 'Main Balcony',
          location: 'Balcony',
          type: 'Furniture',
          condition: 'Fair',
          in_use: 1,
          deductible: 0,
          purchase_date: '2022-11-01',
          warranty_expires: null,
          replacement_value: 199.0,
          resale_value: 50.0,
          purchase_transaction_id: null,
          purchased_from_id: null,
          purchased_from_name: 'Kmart',
          asset_id: null,
          notes: 'Oil annually. Table + 2 chairs.',
          location_id: 'loc-balcony',
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
        // Living room: power board → TV → HDMI cable
        ['inv-003', 'inv-007'], // TV ↔ Power Board 6-Way
        ['inv-003', 'inv-006'], // TV ↔ HDMI cable
        // Office desk setup: desk → chair, MacBook → hub → cables → power
        ['inv-001', 'inv-008'], // MacBook ↔ USB-C Hub
        ['inv-008', 'inv-009'], // Hub ↔ Ethernet cable
        ['inv-008', 'inv-010'], // Hub ↔ Power Board 4-Way
        ['inv-001', 'inv-010'], // MacBook ↔ Power Board (charger)
        ['inv-001', 'inv-002'], // MacBook ↔ Headphones (Bluetooth pair)
        ['inv-001', 'inv-011'], // MacBook ↔ Standing Desk (work station)
        ['inv-011', 'inv-012'], // Standing Desk ↔ Chair (ergonomic pair)
        // Bike gear
        ['inv-015', 'inv-016'], // Road Bike ↔ Helmet
        // Tool storage
        ['inv-013', 'inv-014'], // Drill ↔ Socket Set (stored together)
      ];

      const insertConnection = db.prepare(`
      INSERT INTO item_connections (item_a_id, item_b_id) VALUES (?, ?)
    `);

      for (const [a, b] of connections) {
        // Enforce A < B ordering
        if (!a || !b) continue;
        const [lo, hi] = a < b ? [a, b] : [b, a];
        insertConnection.run(lo, hi);
      }

      // -------------------------------------------------------------------------
      // Wish List
      // -------------------------------------------------------------------------
      const wishList = [
        {
          id: 'wish-001',
          item: 'New Gaming PC',
          target_amount: 3500.0,
          saved: 1200.0,
          priority: 'Soon',
          url: 'https://www.pccasegear.com',
          notes: 'RTX 4080, Ryzen 9 7950X build',
        },
        {
          id: 'wish-002',
          item: 'Standing Desk',
          target_amount: 800.0,
          saved: 450.0,
          priority: 'Needing',
          url: 'https://www.jarvis.com.au',
          notes: 'Fully Jarvis bamboo top',
        },
        {
          id: 'wish-003',
          item: 'Japan Trip',
          target_amount: 8000.0,
          saved: 2100.0,
          priority: 'One Day',
          url: null,
          notes: '2 week trip to Tokyo, Kyoto, Osaka',
        },
        {
          id: 'wish-004',
          item: 'Herman Miller Chair',
          target_amount: 2200.0,
          saved: 0.0,
          priority: 'Dreaming',
          url: 'https://www.hermanmiller.com',
          notes: 'Aeron fully loaded',
        },
        {
          id: 'wish-005',
          item: 'New Camera',
          target_amount: 4500.0,
          saved: 800.0,
          priority: 'One Day',
          url: 'https://www.sony.com.au',
          notes: 'Sony A7 IV with 24-70mm f/2.8 GM II',
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
          title: 'The Shawshank Redemption',
          overview:
            'Imprisoned in the 1940s for the double murder of his wife and her lover, upstanding banker Andy Dufresne begins a new life at the Shawshank prison.',
          release_date: '1994-09-23',
          runtime: 142,
          status: 'Released',
          original_language: 'en',
          vote_average: 8.7,
          vote_count: 26000,
          genres: '["Drama","Crime"]',
          poster_path: '/9cq9oGvBr8vV0HOf4Uf69TfO8S9.jpg',
          backdrop_path: '/kXfq7j3nBYXoztZ6QT6O9HriI7v.jpg',
        },
        {
          tmdb_id: 238,
          title: 'The Godfather',
          overview:
            'Spanning the years 1945 to 1955, a chronicle of the fictional Italian-American Corleone crime family.',
          release_date: '1972-03-14',
          runtime: 175,
          status: 'Released',
          original_language: 'en',
          vote_average: 8.7,
          vote_count: 20000,
          genres: '["Drama","Crime"]',
          poster_path: '/3bhkrjOiERoSTq9A91In2Y7LpXm.jpg',
          backdrop_path: '/tmU7GeKVZ2uDZZCOREPt7m86ub3.jpg',
        },
        {
          tmdb_id: 155,
          title: 'The Dark Knight',
          overview:
            'Batman raises the stakes in his war on crime. With the help of Lt. Jim Gordon and District Attorney Harvey Dent, Batman sets out to dismantle the remaining criminal organizations that plague the streets.',
          release_date: '2008-07-16',
          runtime: 152,
          status: 'Released',
          original_language: 'en',
          vote_average: 8.5,
          vote_count: 32000,
          genres: '["Drama","Action","Crime","Thriller"]',
          poster_path: '/qJ2PvW9brE7FieldVwaGZp0uX2P.jpg',
          backdrop_path: '/nMK9Szwu260ySbb1oMcIu6YpDoc.jpg',
        },
        {
          tmdb_id: 680,
          title: 'Pulp Fiction',
          overview:
            "A burger-loving hit man, his philosophical partner, a drug-addled gangster's moll and a washed-up boxer converge in this sprawling, comedic crime caper.",
          release_date: '1994-09-10',
          runtime: 154,
          status: 'Released',
          original_language: 'en',
          vote_average: 8.5,
          vote_count: 27000,
          genres: '["Thriller","Crime"]',
          poster_path: '/d5iIl9h9btztU0kzRXR9qUFjwYc.jpg',
          backdrop_path: '/su69mB7W4PkIPq46tS9vC0S9gh8.jpg',
        },
        {
          tmdb_id: 13,
          title: 'Forrest Gump',
          overview:
            'A man with a low IQ has accomplished great things in his life and been present during significant historic events — in each case, far exceeding what anyone imagined he could do.',
          release_date: '1994-06-23',
          runtime: 142,
          status: 'Released',
          original_language: 'en',
          vote_average: 8.5,
          vote_count: 26000,
          genres: '["Comedy","Drama","Romance"]',
          poster_path: '/arw2vcBveWOvMsCMD0STz0nSCDI.jpg',
          backdrop_path: '/qd9p8942lKz3H6F8u7D7i2E2L7m.jpg',
        },
        {
          tmdb_id: 550,
          title: 'Fight Club',
          overview:
            'A ticking-time bomb insomniac and a slippery soap salesman channel primal male aggression into a shocking new form of therapy.',
          release_date: '1999-10-15',
          runtime: 139,
          status: 'Released',
          original_language: 'en',
          vote_average: 8.4,
          vote_count: 28000,
          genres: '["Drama"]',
          poster_path: '/pB8BM7vSc6WL6rsRzfnv3C98U1M.jpg',
          backdrop_path: '/hZ965qFIn6lYyL0vjJdO1OqUjUv.jpg',
        },
        {
          tmdb_id: 120,
          title: 'The Lord of the Rings: The Fellowship of the Ring',
          overview:
            'Young hobbit Frodo Baggins, after inheriting a mysterious ring from his uncle Bilbo, must leave his home in order to keep it from falling into the hands of its evil creator.',
          release_date: '2001-12-18',
          runtime: 179,
          status: 'Released',
          original_language: 'en',
          vote_average: 8.4,
          vote_count: 24000,
          genres: '["Adventure","Fantasy","Action"]',
          poster_path: '/6oom5QYvA1Ssq1Cish9v66fT0bi.jpg',
          backdrop_path: '/vYvUb7v6KMjJhLW6o79q9B957io.jpg',
        },
        {
          tmdb_id: 603,
          title: 'The Matrix',
          overview:
            'Set in the 22nd century, The Matrix tells the story of a computer hacker who joins a group of underground insurgents fighting the vast and powerful computers who now rule the earth.',
          release_date: '1999-03-30',
          runtime: 136,
          status: 'Released',
          original_language: 'en',
          vote_average: 8.2,
          vote_count: 25000,
          genres: '["Action","Science Fiction"]',
          poster_path: '/f89U3Y9SJuCYFJj6ArpZ3sbvhrZ.jpg',
          backdrop_path: '/3u9uL6iPz9D59M37I0mO0D0M8sM.jpg',
        },
        {
          tmdb_id: 157336,
          title: 'Interstellar',
          overview:
            'The adventures of a group of explorers who make use of a newly discovered wormhole to surpass the limitations on human space travel and conquer the vast distances involved in an interstellar voyage.',
          release_date: '2014-11-05',
          runtime: 169,
          status: 'Released',
          original_language: 'en',
          vote_average: 8.4,
          vote_count: 34000,
          genres: '["Adventure","Drama","Science Fiction"]',
          poster_path: '/gEU2QniE6E77NI6vCU67xtiBPzG.jpg',
          backdrop_path: '/xJHtm9C6z2yv3Kq5B6p5H2L0q1s.jpg',
        },
        {
          tmdb_id: 569094,
          title: 'Spider-Man: Across the Spider-Verse',
          overview:
            "After reuniting with Gwen Stacy, Brooklyn's full-time, friendly neighborhood Spider-Man is catapulted across the Multiverse.",
          release_date: '2023-05-31',
          runtime: 140,
          status: 'Released',
          original_language: 'en',
          vote_average: 8.4,
          vote_count: 6500,
          genres: '["Animation","Action","Adventure"]',
          poster_path: '/8Gxv0gSjLSL1R3m9q1SjSygZsgX.jpg',
          backdrop_path: '/4HodYYKEIsS6teju63uDU6L6rO8.jpg',
        },
      ];

      const insertMovie = db.prepare(`
      INSERT INTO movies (
        tmdb_id, title, overview, release_date, runtime, status,
        original_language, vote_average, vote_count, genres,
        poster_path, backdrop_path
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

      const movieIds: number[] = [];
      for (const movie of movies) {
        const result = insertMovie.run(
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
        movieIds.push(Number(result.lastInsertRowid));
      }

      // -------------------------------------------------------------------------
      // TV Shows
      // -------------------------------------------------------------------------
      const tvShowsData = [
        {
          tvdb_id: 81189,
          name: 'Breaking Bad',
          overview:
            "A high school chemistry teacher diagnosed with inoperable lung cancer turns to manufacturing and selling methamphetamine in order to secure his family's future.",
          first_air_date: '2008-01-20',
          last_air_date: '2013-09-29',
          status: 'Ended',
          original_language: 'en',
          number_of_seasons: 5,
          number_of_episodes: 62,
          episode_run_time: 47,
          vote_average: 8.9,
          vote_count: 13000,
          genres: '["Drama","Crime"]',
          networks: '["AMC"]',
          poster_path: 'https://artworks.thetvdb.com/artworks/posters/81189-1.jpg',
          backdrop_path: 'https://artworks.thetvdb.com/artworks/fanart/81189-1.jpg',
        },
        {
          tvdb_id: 305288,
          name: 'Severance',
          overview:
            'Mark leads a team of office workers whose memories have been surgically divided between their work and personal lives.',
          first_air_date: '2022-02-18',
          last_air_date: null,
          status: 'Returning Series',
          original_language: 'en',
          number_of_seasons: 2,
          number_of_episodes: 19,
          episode_run_time: 50,
          vote_average: 8.4,
          vote_count: 3000,
          genres: '["Drama","Mystery","Science Fiction"]',
          networks: '["Apple TV+"]',
          poster_path: 'https://artworks.thetvdb.com/artworks/posters/305288-2.jpg',
          backdrop_path: 'https://artworks.thetvdb.com/artworks/fanart/305288-1.jpg',
        },
        {
          tvdb_id: 366924,
          name: 'Shogun',
          overview:
            'In Japan in the year 1600, at the dawn of a century-defining civil war, Lord Yoshii Toranaga is fighting for his life as his enemies on the Council of Regents unite against him.',
          first_air_date: '2024-02-27',
          last_air_date: null,
          status: 'Returning Series',
          original_language: 'en',
          number_of_seasons: 1,
          number_of_episodes: 10,
          episode_run_time: 60,
          vote_average: 8.7,
          vote_count: 2500,
          genres: '["Drama","War & Politics"]',
          networks: '["FX"]',
          poster_path: 'https://artworks.thetvdb.com/artworks/posters/366924-1.jpg',
          backdrop_path: 'https://artworks.thetvdb.com/artworks/fanart/366924-1.jpg',
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
      const bbS1 = Number(insertSeason.run(tvShowIds[0], 30272, 1, 'Season 1', 7).lastInsertRowid);
      const bbS1E1 = Number(insertEpisode.run(bbS1, 349232, 1, 'Pilot', 58).lastInsertRowid);
      const bbS1E2 = Number(
        insertEpisode.run(bbS1, 349233, 2, "Cat's in the Bag...", 48).lastInsertRowid
      );
      const bbS1E3 = Number(
        insertEpisode.run(bbS1, 349234, 3, "...And the Bag's in the River", 48).lastInsertRowid
      );

      const bbS5 = Number(
        insertSeason.run(tvShowIds[0], 488434, 5, 'Season 5', 16).lastInsertRowid
      );
      insertEpisode.run(bbS5, 4161693, 1, 'Live Free or Die', 47);
      insertEpisode.run(bbS5, 4161694, 2, 'Madrigal', 47);
      insertEpisode.run(bbS5, 4529635, 9, 'Blood Money', 47);
      insertEpisode.run(bbS5, 4649411, 16, 'Felina', 55);

      // Severance — seasons 1 & 2
      const sevS1 = Number(
        insertSeason.run(tvShowIds[1], 1893498, 1, 'Season 1', 9).lastInsertRowid
      );
      insertEpisode.run(sevS1, 8361124, 1, 'Good News About Hell', 57);
      insertEpisode.run(sevS1, 8400665, 2, 'Half Loop', 51);
      insertEpisode.run(sevS1, 8786314, 9, 'The We We Are', 42);

      const sevS2 = Number(
        insertSeason.run(tvShowIds[1], 2145611, 2, 'Season 2', 10).lastInsertRowid
      );
      insertEpisode.run(sevS2, 10337005, 1, 'Hello, Ms. Cobel', 56);
      insertEpisode.run(sevS2, 10337006, 2, 'Goodbye, Mrs. Selvig', 49);
      insertEpisode.run(sevS2, 10337013, 10, 'Cold Harbor', 72);

      // Shogun — season 1
      const shoS1 = Number(
        insertSeason.run(tvShowIds[2], 2043811, 1, 'Season 1', 10).lastInsertRowid
      );
      insertEpisode.run(shoS1, 9784549, 1, 'Anjin', 70);
      insertEpisode.run(shoS1, 9784550, 2, 'Servants of Two Masters', 55);
      insertEpisode.run(shoS1, 9784558, 10, 'A Dream of a Dream', 70);

      // -------------------------------------------------------------------------
      // Watchlist
      // -------------------------------------------------------------------------
      const insertWatchlist = db.prepare(`
      INSERT INTO watchlist (media_type, media_id, priority, notes, added_at)
      VALUES (?, ?, ?, ?, ?)
    `);

      // Queue up some movies and a show to watch
      insertWatchlist.run(
        'movie',
        movieIds[7],
        1,
        "Rewatch — it's been years",
        '2026-02-01T10:00:00Z'
      ); // Matrix
      insertWatchlist.run(
        'movie',
        movieIds[8],
        2,
        'IMAX re-release coming',
        '2026-02-05T14:00:00Z'
      ); // Interstellar
      insertWatchlist.run('movie', movieIds[5], 0, null, '2026-02-10T09:00:00Z'); // Fight Club
      insertWatchlist.run('tv_show', tvShowIds[2], 1, 'Finish season 1', '2026-01-20T08:00:00Z'); // Shogun
      const watchlistCount = 4;

      // -------------------------------------------------------------------------
      // Watch History
      // -------------------------------------------------------------------------
      const insertWatchHistory = db.prepare(`
      INSERT INTO watch_history (media_type, media_id, watched_at, completed)
      VALUES (?, ?, ?, ?)
    `);

      // Mark some movies as watched
      insertWatchHistory.run('movie', movieIds[0], '2026-01-15T20:00:00Z', 1); // Shawshank
      insertWatchHistory.run('movie', movieIds[1], '2026-01-18T21:00:00Z', 1); // Godfather
      insertWatchHistory.run('movie', movieIds[2], '2026-01-22T19:30:00Z', 1); // Dark Knight
      insertWatchHistory.run('movie', movieIds[3], '2026-01-25T20:00:00Z', 1); // Pulp Fiction
      insertWatchHistory.run('movie', movieIds[6], '2026-02-01T19:00:00Z', 1); // LOTR
      // Mark some episodes as watched (Breaking Bad S1)
      insertWatchHistory.run('episode', bbS1E1, '2026-02-05T20:00:00Z', 1);
      insertWatchHistory.run('episode', bbS1E2, '2026-02-06T20:00:00Z', 1);
      insertWatchHistory.run('episode', bbS1E3, '2026-02-07T20:00:00Z', 1);
      const watchHistoryCount = 8;

      // -------------------------------------------------------------------------
      // Comparison Dimensions
      // -------------------------------------------------------------------------
      const insertDimension = db.prepare(`
      INSERT INTO comparison_dimensions (name, description, active, sort_order)
      VALUES (?, ?, 1, ?)
    `);

      const dimCinema = Number(
        insertDimension.run(
          'Cinematography',
          'Visual quality, camera work, and artistic direction',
          1
        ).lastInsertRowid
      );
      const dimActing = Number(
        insertDimension.run('Acting', 'Quality of performances', 2).lastInsertRowid
      );
      const dimRewatch = Number(
        insertDimension.run('Rewatchability', 'How much you want to watch it again', 3)
          .lastInsertRowid
      );
      const dimFun = Number(
        insertDimension.run('Fun', 'Pure entertainment value', 4).lastInsertRowid
      );
      const dimEmotion = Number(
        insertDimension.run('Emotional Impact', 'How deeply it affects you', 5).lastInsertRowid
      );
      const dimensionCount = 5;

      // -------------------------------------------------------------------------
      // Comparisons (pairwise movie matchups)
      // -------------------------------------------------------------------------
      const insertComparison = db.prepare(`
      INSERT INTO comparisons (dimension_id, media_a_type, media_a_id, media_b_type, media_b_id, winner_type, winner_id, compared_at)
      VALUES (?, 'movie', ?, 'movie', ?, 'movie', ?, ?)
    `);

      // Cinematography matchups
      insertComparison.run(
        dimCinema,
        movieIds[2],
        movieIds[3],
        movieIds[2],
        '2026-02-10T10:00:00Z'
      ); // Dark Knight > Pulp Fiction
      insertComparison.run(
        dimCinema,
        movieIds[8],
        movieIds[6],
        movieIds[8],
        '2026-02-10T10:01:00Z'
      ); // Interstellar > LOTR
      insertComparison.run(
        dimCinema,
        movieIds[1],
        movieIds[0],
        movieIds[1],
        '2026-02-10T10:02:00Z'
      ); // Godfather > Shawshank
      // Acting matchups
      insertComparison.run(
        dimActing,
        movieIds[0],
        movieIds[4],
        movieIds[0],
        '2026-02-10T10:03:00Z'
      ); // Shawshank > Forrest Gump
      insertComparison.run(
        dimActing,
        movieIds[1],
        movieIds[3],
        movieIds[1],
        '2026-02-10T10:04:00Z'
      ); // Godfather > Pulp Fiction
      // Rewatchability matchups
      insertComparison.run(
        dimRewatch,
        movieIds[3],
        movieIds[2],
        movieIds[3],
        '2026-02-10T10:05:00Z'
      ); // Pulp Fiction > Dark Knight
      insertComparison.run(
        dimRewatch,
        movieIds[9],
        movieIds[4],
        movieIds[9],
        '2026-02-10T10:06:00Z'
      ); // Spider-Verse > Forrest Gump
      // Fun matchups
      insertComparison.run(dimFun, movieIds[9], movieIds[7], movieIds[9], '2026-02-10T10:07:00Z'); // Spider-Verse > Matrix
      insertComparison.run(dimFun, movieIds[2], movieIds[6], movieIds[2], '2026-02-10T10:08:00Z'); // Dark Knight > LOTR
      // Emotional Impact
      insertComparison.run(
        dimEmotion,
        movieIds[0],
        movieIds[8],
        movieIds[0],
        '2026-02-10T10:09:00Z'
      ); // Shawshank > Interstellar
      const comparisonCount = 10;

      // -------------------------------------------------------------------------
      // Media Scores (pre-computed from comparisons)
      // -------------------------------------------------------------------------
      const insertScore = db.prepare(`
      INSERT INTO media_scores (media_type, media_id, dimension_id, score, comparison_count, updated_at)
      VALUES ('movie', ?, ?, ?, ?, '2026-02-10T10:10:00Z')
    `);

      // Give scored movies reasonable Elo-like ratings based on comparisons
      insertScore.run(movieIds[0], dimCinema, 1480, 1); // Shawshank
      insertScore.run(movieIds[1], dimCinema, 1530, 2); // Godfather (won)
      insertScore.run(movieIds[2], dimCinema, 1520, 1); // Dark Knight (won)
      insertScore.run(movieIds[8], dimCinema, 1520, 1); // Interstellar (won)
      insertScore.run(movieIds[0], dimActing, 1520, 1); // Shawshank (won)
      insertScore.run(movieIds[1], dimActing, 1520, 1); // Godfather (won)
      insertScore.run(movieIds[3], dimRewatch, 1520, 1); // Pulp Fiction (won)
      insertScore.run(movieIds[9], dimRewatch, 1520, 1); // Spider-Verse (won)
      insertScore.run(movieIds[9], dimFun, 1530, 1); // Spider-Verse (won)
      insertScore.run(movieIds[2], dimFun, 1520, 1); // Dark Knight (won)
      insertScore.run(movieIds[0], dimEmotion, 1520, 1); // Shawshank (won)
      const scoreCount = 11;

      // -------------------------------------------------------------------------
      // AI Usage
      // -------------------------------------------------------------------------
      const insertAiUsage = db.prepare(`
      INSERT INTO ai_inference_log (provider, model, operation, domain, input_tokens, output_tokens, cost_usd, latency_ms, status, cached, context_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

      insertAiUsage.run(
        'claude',
        'claude-haiku-4-5-20251001',
        'entity-match',
        'finance',
        150,
        25,
        0.0003,
        120,
        'success',
        0,
        'batch-2026-01-15',
        '2026-01-15T10:00:00Z'
      );
      insertAiUsage.run(
        'claude',
        'claude-haiku-4-5-20251001',
        'entity-match',
        'finance',
        140,
        20,
        0.0002,
        110,
        'success',
        0,
        'batch-2026-01-15',
        '2026-01-15T10:00:01Z'
      );
      insertAiUsage.run(
        'claude',
        'claude-haiku-4-5-20251001',
        'entity-match',
        'finance',
        160,
        22,
        0.0002,
        95,
        'success',
        0,
        'batch-2026-02-01',
        '2026-02-01T10:00:00Z'
      );
      const aiUsageCount = 3;

      // -------------------------------------------------------------------------
      // Corrections, tag rules, media ops / sync / rotation / debrief satellites
      // -------------------------------------------------------------------------
      const insertCorrection = db.prepare(`
      INSERT INTO transaction_corrections (
        id, description_pattern, match_type, entity_id, entity_name, location, tags,
        transaction_type, is_active, confidence, times_applied, created_at, last_used_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
    `);
      insertCorrection.run(
        'corr-seed-001',
        'WOOLWORTHS%',
        'contains',
        '10000000-0000-4000-8000-000000000001',
        'Woolworths',
        null,
        '["Groceries"]',
        'purchase',
        0.88,
        3,
        '2026-01-01T00:00:00Z',
        '2026-02-01T10:00:00Z'
      );
      insertCorrection.run(
        'corr-seed-002',
        'NETFLIX',
        'exact',
        '10000000-0000-4000-8000-000000000003',
        'Netflix',
        null,
        '["Entertainment","Subscriptions"]',
        null,
        0.92,
        1,
        now,
        null
      );

      const insertTagRule = db.prepare(`
      INSERT INTO transaction_tag_rules (
        id, description_pattern, match_type, entity_id, tags, is_active, confidence, times_applied, created_at
      ) VALUES (?, ?, 'contains', ?, ?, 1, 0.8, 2, ?)
    `);
      insertTagRule.run(
        'tagrule-seed-001',
        'SHELL',
        '10000000-0000-4000-8000-000000000005',
        '["Fuel","Transport"]',
        now
      );
      insertTagRule.run(
        'tagrule-seed-002',
        'AMAZON',
        '10000000-0000-4000-8000-000000000006',
        '["Shopping","Technology"]',
        now
      );

      const insertStaleness = db.prepare(`
      INSERT INTO comparison_staleness (media_type, media_id, staleness, updated_at)
      VALUES ('movie', ?, 1.15, '2026-02-10T09:00:00Z')
    `);
      insertStaleness.run(movieIds[0]);
      insertStaleness.run(movieIds[3]);
      insertStaleness.run(movieIds[9]);

      db.prepare(
        `INSERT INTO item_photos (item_id, file_path, caption, sort_order) VALUES (?, ?, ?, ?)`
      ).run('inv-001', '/data/imports/photos/inv-macbook-front.jpg', 'Front (seed)', 0);
      db.prepare(
        `INSERT INTO item_photos (item_id, file_path, caption, sort_order) VALUES (?, ?, ?, ?)`
      ).run('inv-001', '/data/imports/photos/inv-macbook-rear.jpg', 'Rear ports', 1);

      db.prepare(
        `INSERT INTO item_documents (item_id, paperless_document_id, document_type, title)
       VALUES (?, ?, 'receipt', ?)`
      ).run('inv-001', 900001, 'AppleCare purchase (seed)');
      db.prepare(
        `INSERT INTO item_documents (item_id, paperless_document_id, document_type, title)
       VALUES (?, ?, 'warranty', ?)`
      ).run('inv-002', 900002, 'JB Hi-Fi warranty card (seed)');

      const insertSetting = db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?)`);
      insertSetting.run('rotation_cron_expression', '0 3 * * *');
      insertSetting.run('rotation_target_free_gb', '100');
      insertSetting.run('rotation_leaving_days', '7');
      insertSetting.run('rotation_daily_additions', '2');
      insertSetting.run('rotation_avg_movie_gb', '15');
      insertSetting.run('rotation_protected_days', '30');
      insertSetting.run('plex_url', 'http://127.0.0.1:32400');

      db.prepare(
        `INSERT INTO sync_logs (synced_at, movies_synced, tv_shows_synced, errors, duration_ms)
       VALUES ('2026-02-09T12:00:00Z', 120, 40, NULL, 45000)`
      ).run();

      db.prepare(
        `INSERT INTO sync_job_results (
        id, job_type, status, started_at, completed_at, duration_ms, progress, result, error
      ) VALUES (?, 'plex_library', 'completed', ?, ?, ?, ?, ?, NULL)`
      ).run(
        'job-seed-plex-1',
        '2026-02-09T11:59:00Z',
        '2026-02-09T12:00:00Z',
        60000,
        '{"processed":160,"total":160}',
        '{"ok":true,"sections":["Movies","TV"]}'
      );

      db.prepare(`INSERT INTO dismissed_discover (tmdb_id, dismissed_at) VALUES (424242, ?)`).run(
        '2026-01-05T08:00:00Z'
      );

      db.prepare(`INSERT INTO shelf_impressions (shelf_id) VALUES ('discover_featured')`).run();
      db.prepare(`INSERT INTO shelf_impressions (shelf_id) VALUES ('compare_queue')`).run();

      const radarrSourceId = Number(
        db
          .prepare(
            `INSERT INTO rotation_sources (type, name, priority, enabled) VALUES ('radarr', 'Radarr (seed)', 5, 0)`
          )
          .run().lastInsertRowid
      );

      db.prepare(
        `INSERT INTO rotation_candidates (source_id, tmdb_id, title, year, rating, poster_path, status)
       VALUES (?, 888001, 'Seed Candidate Film', 2010, 7.2, '/seed/poster-888001.jpg', 'pending')`
      ).run(radarrSourceId);

      db.prepare(
        `INSERT INTO rotation_candidates (source_id, tmdb_id, title, year, status)
       VALUES (?, 888003, 'Another Seed Candidate', 2015, 'review')`
      ).run(radarrSourceId);

      db.prepare(
        `INSERT INTO rotation_exclusions (tmdb_id, title, reason) VALUES (888002, 'Excluded Seed Title', 'Duplicate in Radarr')`
      ).run();

      db.prepare(
        `INSERT INTO rotation_log (
        executed_at, movies_marked_leaving, movies_removed, movies_added,
        removals_failed, free_space_gb, target_free_gb, skipped_reason, details
      ) VALUES ('2026-02-08T03:00:00Z', 2, 0, 1, 0, 420.5, 100, NULL, '{"seed":true}')`
      ).run();

      const skipUntil = Math.floor(Date.now() / 1000) + 86_400;
      db.prepare(
        `INSERT INTO comparison_skip_cooloffs (
        dimension_id, media_a_type, media_a_id, media_b_type, media_b_id, skip_until
      ) VALUES (?, 'movie', ?, 'movie', ?, ?)`
      ).run(dimCinema, movieIds[2], movieIds[5], skipUntil);

      db.prepare(
        `INSERT INTO tier_overrides (media_type, media_id, dimension_id, tier) VALUES ('movie', ?, ?, 'S')`
      ).run(movieIds[0], dimActing);

      db.prepare(
        `INSERT INTO environments (name, db_path, seed_type, ttl_seconds, expires_at)
       VALUES ('fixture', './data/pops-fixture-env.db', 'test', NULL, NULL)`
      ).run();

      const firstWatchHistory = db
        .prepare('SELECT id FROM watch_history ORDER BY id ASC LIMIT 1')
        .get() as { id: number } | undefined;
      const firstComparison = db
        .prepare('SELECT id FROM comparisons ORDER BY id ASC LIMIT 1')
        .get() as { id: number } | undefined;
      if (firstWatchHistory === undefined || firstComparison === undefined) {
        throw new Error('[seeder] debrief seed requires watch_history and comparisons rows');
      }

      const debriefSessionId = Number(
        db
          .prepare(`INSERT INTO debrief_sessions (watch_history_id, status) VALUES (?, 'complete')`)
          .run(firstWatchHistory.id).lastInsertRowid
      );

      db.prepare(
        `INSERT INTO debrief_results (session_id, dimension_id, comparison_id) VALUES (?, ?, ?)`
      ).run(debriefSessionId, dimCinema, firstComparison.id);

      db.prepare(
        `INSERT INTO debrief_status (media_type, media_id, dimension_id, debriefed, dismissed, updated_at)
       VALUES ('movie', ?, ?, 1, 0, ?)`
      ).run(movieIds[1], dimRewatch, now);

      const satelliteCounts = {
        corrections: 2,
        tagRules: 2,
        staleness: 3,
        itemPhotos: 2,
        itemDocuments: 2,
        settings: 7,
        syncLogs: 1,
        syncJobs: 1,
        dismissedDiscover: 1,
        shelfImpressions: 2,
        rotationCandidates: 2,
        rotationExclusions: 1,
        rotationLog: 1,
        skipCooloffs: 1,
        tierOverrides: 1,
        environments: 1,
        debriefSessions: 1,
        debriefResults: 1,
        debriefStatus: 1,
      };

      // Count totals for log
      const seasonCount = 5;
      const episodeCount = 16;

      console.warn(
        `[seeder] Seeded ${entities.length} entities, ${transactions.length} transactions, ` +
          `${budgets.length} budgets, ${homeInventory.length} inventory items, ${wishList.length} wish list items, ` +
          `${movies.length} movies, ${tvShowsData.length} tv shows, ${seasonCount} seasons, ${episodeCount} episodes, ` +
          `${locations.length} locations, ${connections.length} connections, ` +
          `${watchlistCount} watchlist, ${watchHistoryCount} watch history, ` +
          `${dimensionCount} dimensions, ${comparisonCount} comparisons, ${scoreCount} scores, ${aiUsageCount} ai usage; ` +
          `satellites: corrections=${satelliteCounts.corrections}, tag_rules=${satelliteCounts.tagRules}, ` +
          `staleness=${satelliteCounts.staleness}, item_photos=${satelliteCounts.itemPhotos}, ` +
          `item_documents=${satelliteCounts.itemDocuments}, settings=${satelliteCounts.settings}, ` +
          `sync_logs=${satelliteCounts.syncLogs}, sync_jobs=${satelliteCounts.syncJobs}, ` +
          `dismissed_discover=${satelliteCounts.dismissedDiscover}, shelf_impressions=${satelliteCounts.shelfImpressions}, ` +
          `rotation_candidates=${satelliteCounts.rotationCandidates}, rotation_exclusions=${satelliteCounts.rotationExclusions}, ` +
          `rotation_log=${satelliteCounts.rotationLog}, skip_cooloffs=${satelliteCounts.skipCooloffs}, ` +
          `tier_overrides=${satelliteCounts.tierOverrides}, environments=${satelliteCounts.environments}, ` +
          `debrief_sessions=${satelliteCounts.debriefSessions}, debrief_results=${satelliteCounts.debriefResults}, ` +
          `debrief_status=${satelliteCounts.debriefStatus}`
      );
    })();
  } finally {
    db.pragma('foreign_keys = ON');
  }
}
