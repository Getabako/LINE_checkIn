/**
 * Firestore -> Neon PostgreSQL データ移行。
 * 事前に scripts/dump-firestore.mjs で出力した JSON ディレクトリを読み込んで投入する。
 *   node --env-file=.env scripts/migrate-to-neon.mjs <dumpDir> [--truncate]
 */
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const dumpDir = process.argv[2];
const truncate = process.argv.includes('--truncate');
if (!dumpDir) {
  console.error('usage: node --env-file=.env scripts/migrate-to-neon.mjs <dumpDir> [--truncate]');
  process.exit(1);
}

const JSON_DOC_TABLES = new Set(['settings']);
const camelToSnake = (s) => s.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
const snakeToCamel = (s) => s.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());

const client = new pg.Client({ connectionString: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL });
await client.connect();

const { rows: colRows } = await client.query(
  `select table_name, column_name, data_type from information_schema.columns where table_schema = 'public'`
);
const tables = new Map();
for (const r of colRows) {
  if (!tables.has(r.table_name)) tables.set(r.table_name, { columns: new Map(), timestamps: new Set() });
  const info = tables.get(r.table_name);
  info.columns.set(snakeToCamel(r.column_name), r.column_name);
  if (r.data_type.startsWith('timestamp')) info.timestamps.add(r.column_name);
}

/** Firestore Timestamp を dump で {__ts} に落としてあるので ISO 文字列へ戻す */
function normalize(v) {
  if (v && typeof v === 'object' && !Array.isArray(v) && '__ts' in v) return v.__ts;
  return v;
}

const summary = {};
for (const file of fs.readdirSync(dumpDir).filter((f) => f.endsWith('.json'))) {
  const collection = file.replace(/\.json$/, '');
  const table = camelToSnake(collection);
  const info = tables.get(table);
  if (!info) {
    console.warn(`skip ${collection}: テーブル ${table} が存在しない`);
    continue;
  }
  const docs = JSON.parse(fs.readFileSync(path.join(dumpDir, file), 'utf8'));
  if (truncate) await client.query(`truncate ${table}`);

  for (const doc of docs) {
    const { __id: id, ...raw } = doc;

    if (JSON_DOC_TABLES.has(table)) {
      await client.query(
        `insert into ${table} (id, data) values ($1, $2::jsonb)
         on conflict (id) do update set data = excluded.data`,
        [id, JSON.stringify(raw)]
      );
      continue;
    }

    const cols = ['id'];
    const values = [id];
    const extra = {};
    for (const [field, rawValue] of Object.entries(raw)) {
      const value = normalize(rawValue);
      const column = info.columns.get(field);
      if (column && column !== 'id' && column !== 'extra') {
        cols.push(column);
        values.push(value === undefined ? null : value);
      } else if (value !== undefined) {
        extra[field] = value;
      }
    }
    if (Object.keys(extra).length > 0) {
      cols.push('extra');
      values.push(JSON.stringify(extra));
    }
    const params = cols.map((c, i) => (c === 'extra' ? `$${i + 1}::jsonb` : `$${i + 1}`));
    const updates = cols.filter((c) => c !== 'id').map((c) => `${c} = excluded.${c}`);
    await client.query(
      `insert into ${table} (${cols.join(', ')}) values (${params.join(', ')})
       ${updates.length ? `on conflict (id) do update set ${updates.join(', ')}` : 'on conflict (id) do nothing'}`,
      values
    );
  }
  const { rows } = await client.query(`select count(*)::int as n from ${table}`);
  summary[table] = { dumped: docs.length, inserted: rows[0].n };
}

console.table(summary);
await client.end();
