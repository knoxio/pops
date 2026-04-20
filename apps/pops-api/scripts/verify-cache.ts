import { stat } from 'node:fs/promises';
import { join } from 'node:path';

async function checkCache() {
  const imagesDir = './data/media/images';

  const tests = [
    { type: 'movie', id: 278, file: 'poster.jpg' },
    { type: 'movie', id: 238, file: 'backdrop.jpg' },
    { type: 'tv', id: 81189, file: 'poster.jpg' },
    { type: 'tv', id: 305288, file: 'backdrop.jpg' },
  ];

  console.log('🔍 Checking Media Image Cache...');

  for (const t of tests) {
    const dir = t.type === 'movie' ? 'movies' : 'tv';
    const path = join(imagesDir, dir, String(t.id), t.file);
    try {
      const s = await stat(path);
      console.log(`✅ [${t.type}] ${t.id} ${t.file}: ${s.size} bytes`);
    } catch {
      console.log(`❌ [${t.type}] ${t.id} ${t.file}: NOT FOUND`);
    }
  }
}

void checkCache();
