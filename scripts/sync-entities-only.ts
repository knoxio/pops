#!/usr/bin/env tsx
/**
 * Sync only entities from Notion to local database
 */

import 'dotenv/config';
import BetterSqlite3 from 'better-sqlite3';
import { Client } from '@notionhq/client';
import * as path from 'path';

// Entity database IDs
const NOTION_DB = {
  ENTITIES: process.env.NOTION_ENTITIES_DB_ID!,
};

interface NotionPage {
  id: string;
  last_edited_time: string;
  properties: Record<string, any>;
}

interface Entity {
  notion_id: string;
  name: string;
  last_edited_time: string;
}

async function fetchEntities(notion: Client): Promise<NotionPage[]> {
  const pages: NotionPage[] = [];
  let hasMore = true;
  let startCursor: string | undefined = undefined;

  console.log('[sync] Fetching entities from Notion...');

  while (hasMore) {
    const response = await notion.databases.query({
      database_id: NOTION_DB.ENTITIES,
      start_cursor: startCursor,
      page_size: 100,
    });

    pages.push(...(response.results as NotionPage[]));
    hasMore = response.has_more;
    startCursor = response.next_cursor ?? undefined;
  }

  return pages;
}

function mapEntity(page: NotionPage): Entity {
  const nameProperty = page.properties['Name'];
  const name = nameProperty?.title?.[0]?.plain_text ?? 'Untitled';

  return {
    notion_id: page.id,
    name,
    last_edited_time: page.last_edited_time,
  };
}

function upsertEntities(db: BetterSqlite3.Database, entities: Entity[]): void {
  const stmt = db.prepare(`
    INSERT INTO entities (notion_id, name, last_edited_time)
    VALUES (@notion_id, @name, @last_edited_time)
    ON CONFLICT(notion_id) DO UPDATE SET
      name = excluded.name,
      last_edited_time = excluded.last_edited_time
  `);

  const insertMany = db.transaction((entities: Entity[]) => {
    for (const entity of entities) {
      stmt.run(entity);
    }
  });

  insertMany(entities);
}

async function main() {
  const dbPath = path.join(__dirname, '../apps/finance-api/data/pops.db');
  console.log(`[sync] Database: ${dbPath}`);

  const db = new BetterSqlite3(dbPath);
  const notion = new Client({ auth: process.env.NOTION_API_TOKEN });

  try {
    // Fetch all entities
    const pages = await fetchEntities(notion);
    console.log(`[sync] Found ${pages.length} entities in Notion`);

    // Map to entity rows
    const entities = pages.map(mapEntity);

    // Upsert into database
    upsertEntities(db, entities);
    console.log(`[sync] ✓ Synced ${entities.length} entities`);

    // Show Ampol and IKEA
    const results = db.prepare(`
      SELECT name, notion_id
      FROM entities
      WHERE LOWER(name) IN ('ampol', 'ikea')
      ORDER BY name
    `).all();

    console.log('\n📋 Ampol and IKEA entities:');
    for (const row of results) {
      console.log(`  ${(row as any).name}: ${(row as any).notion_id}`);
    }
  } finally {
    db.close();
  }
}

main().catch((error) => {
  console.error('❌ Error:', error);
  process.exit(1);
});
