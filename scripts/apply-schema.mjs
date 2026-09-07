import fs from 'node:fs';
import pg from 'pg';

const sql = fs.readFileSync(new URL('./schema.sql', import.meta.url), 'utf8');
const client = new pg.Client({ connectionString: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL });
await client.connect();
await client.query(sql);
const { rows } = await client.query(
  "select table_name from information_schema.tables where table_schema='public' order by table_name"
);
console.log(rows.map(r => r.table_name).join('\n'));
await client.end();
