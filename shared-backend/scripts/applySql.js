import dotenv from 'dotenv';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { Client } from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const dbUrl = process.env.SUPABASE_DB_URL ?? process.env.DATABASE_URL;

if (!dbUrl) {
  throw new Error('Missing SUPABASE_DB_URL (or DATABASE_URL) in shared-backend/.env');
}

function getArgValue(flag) {
  const prefix = `--${flag}=`;
  const index = process.argv.findIndex((entry) => entry.startsWith(prefix) || entry === `--${flag}`);
  if (index === -1) {
    return '';
  }
  const direct = process.argv[index];
  if (direct.startsWith(prefix)) {
    return direct.slice(prefix.length).trim();
  }
  const next = process.argv[index + 1];
  return typeof next === 'string' ? next.trim() : '';
}

async function run() {
  const fileArg = getArgValue('file');
  const sqlPath = fileArg
    ? path.resolve(process.cwd(), fileArg)
    : path.resolve(__dirname, './create_notifications_table.sql');

  const sql = await fs.readFile(sqlPath, 'utf-8');

  const client = new Client({ connectionString: dbUrl });
  await client.connect();
  try {
    await client.query(sql);
  } finally {
    await client.end();
  }

  console.log(`Applied SQL from ${sqlPath}`);
}

run().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
