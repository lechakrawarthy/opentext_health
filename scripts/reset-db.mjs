// Deletes the local SQLite database so the next server start re-seeds demo data.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
for (const f of ['canopy.db', 'canopy.db-wal', 'canopy.db-shm']) {
  const p = path.join(dir, f);
  if (fs.existsSync(p)) {
    fs.rmSync(p);
    console.log('removed', p);
  }
}
console.log('Database reset. Start the server to re-seed.');
