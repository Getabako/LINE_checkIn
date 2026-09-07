/**
 * Firestore 互換の薄いレイヤ（バックエンドは Neon PostgreSQL）。
 *
 * 旧 server-lib/firebase.ts と同じ `getDb()` / `COLLECTIONS` を公開しているため、
 * API 側のコード（131 箇所の Firestore 呼び出し）はそのまま動く。
 * ドキュメント ID は Firestore と同じ 20 文字ランダム文字列を引き継ぐ。
 *
 * 対応している操作: collection().doc()/where()/orderBy()/limit()/get()/add()、
 * doc の get()/set()/update()/delete()、db.batch()、FieldValue.increment()。
 */
import pg from 'pg';

// numeric(1700) は既定で文字列になるため数値へ戻す
pg.types.setTypeParser(1700, (v) => (v === null ? null : parseFloat(v)));

let pool: pg.Pool | null = null;

function getPool(): pg.Pool {
  if (pool) return pool;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is not set');
  pool = new pg.Pool({ connectionString, max: 3, idleTimeoutMillis: 10_000 });
  return pool;
}

async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  values: unknown[] = []
): Promise<pg.QueryResult<T>> {
  return getPool().query<T>(text, values);
}

// ---------------------------------------------------------------- 命名変換

const ID_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/** Firestore 互換の 20 文字ランダム ID */
function generateId(): string {
  let id = '';
  for (let i = 0; i < 20; i++) {
    id += ID_CHARS[Math.floor(Math.random() * ID_CHARS.length)];
  }
  return id;
}

function camelToSnake(s: string): string {
  return s.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
}

function snakeToCamel(s: string): string {
  return s.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}

/** コレクション名（camelCase）→ テーブル名（snake_case） */
function tableOf(collection: string): string {
  return camelToSnake(collection);
}

// ------------------------------------------------------- カラム情報キャッシュ

type TableInfo = { columns: Map<string, string>; timestamps: Set<string> };

const tableInfoCache = new Map<string, TableInfo>();
let introspected: Promise<void> | null = null;

async function introspect(): Promise<void> {
  const { rows } = await query<{ table_name: string; column_name: string; data_type: string }>(
    `select table_name, column_name, data_type
       from information_schema.columns
      where table_schema = 'public'`
  );
  tableInfoCache.clear();
  for (const r of rows) {
    let info = tableInfoCache.get(r.table_name);
    if (!info) {
      info = { columns: new Map(), timestamps: new Set() };
      tableInfoCache.set(r.table_name, info);
    }
    info.columns.set(snakeToCamel(r.column_name), r.column_name);
    if (r.data_type.startsWith('timestamp')) info.timestamps.add(r.column_name);
  }
}

async function getTableInfo(table: string): Promise<TableInfo> {
  if (!introspected) introspected = introspect();
  await introspected;
  const info = tableInfoCache.get(table);
  if (!info) throw new Error(`Unknown table: ${table}`);
  return info;
}

// ------------------------------------------------------------------ 値の変換

/** 行 → ドキュメント（snake_case カラム＋extra を camelCase に戻す） */
function rowToDoc(row: Record<string, unknown>, info: TableInfo): DocumentData {
  const data: DocumentData = {};
  for (const [field, column] of info.columns) {
    if (column === 'id' || column === 'extra') continue;
    let v = row[column];
    if (v instanceof Date) v = v.toISOString();
    data[field] = v === undefined ? null : v;
  }
  const extra = row.extra as Record<string, unknown> | null | undefined;
  if (extra && typeof extra === 'object') Object.assign(data, extra);
  return data;
}

class Increment {
  constructor(public readonly by: number) {}
}

export const FieldValue = {
  increment: (by: number) => new Increment(by),
};

/** 書き込み値をカラム用に整形。timestamptz は ISO 文字列をそのまま渡せる */
function toColumnValue(value: unknown): unknown {
  if (value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (value !== null && typeof value === 'object') return JSON.stringify(value);
  return value;
}

/** 書き込みデータを「既知カラム」と「extra 行き」に振り分ける */
function splitFields(
  data: Record<string, unknown>,
  info: TableInfo
): { columns: Array<[string, unknown]>; increments: Array<[string, number]>; extra: Record<string, unknown> } {
  const columns: Array<[string, unknown]> = [];
  const increments: Array<[string, number]> = [];
  const extra: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(data)) {
    const column = info.columns.get(field);
    if (column && column !== 'id' && column !== 'extra') {
      if (value instanceof Increment) increments.push([column, value.by]);
      else columns.push([column, toColumnValue(value)]);
    } else {
      extra[field] = value instanceof Increment ? value.by : value;
    }
  }
  return { columns, increments, extra };
}

// ------------------------------------------------------------ settings 特別扱い
// 通知テンプレ・施設プロフィール・料金テーブルはスキーマレスなので jsonb 1 カラムに丸ごと入れる

const JSON_DOC_TABLES = new Set(['settings']);

// ------------------------------------------------------------------ 書き込み

type WriteOp =
  | { kind: 'set'; table: string; id: string; data: Record<string, unknown>; merge: boolean }
  | { kind: 'update'; table: string; id: string; data: Record<string, unknown> }
  | { kind: 'delete'; table: string; id: string };

function buildJsonDocWrite(op: WriteOp): { text: string; values: unknown[] } {
  if (op.kind === 'delete') {
    return { text: `delete from ${op.table} where id = $1`, values: [op.id] };
  }
  const json = JSON.stringify(op.data);
  const replace = op.kind === 'set' && !op.merge;
  return {
    text: `insert into ${op.table} (id, data) values ($1, $2::jsonb)
           on conflict (id) do update set data = ${replace ? 'excluded.data' : `${op.table}.data || excluded.data`}`,
    values: [op.id, json],
  };
}

async function buildWrite(op: WriteOp): Promise<{ text: string; values: unknown[] }> {
  if (JSON_DOC_TABLES.has(op.table)) return buildJsonDocWrite(op);

  if (op.kind === 'delete') {
    return { text: `delete from ${op.table} where id = $1`, values: [op.id] };
  }

  const info = await getTableInfo(op.table);
  const { columns, increments, extra } = splitFields(op.data, info);
  const hasExtra = Object.keys(extra).length > 0;
  const values: unknown[] = [op.id];
  const p = (v: unknown) => `$${values.push(v)}`;

  // set（merge なし）はドキュメント全体の置き換え
  if (op.kind === 'set' && !op.merge) {
    const cols = ['id', ...columns.map(([c]) => c), ...increments.map(([c]) => c)];
    const params = [
      '$1',
      ...columns.map(([, v]) => p(v)),
      ...increments.map(([, by]) => p(by)),
    ];
    if (hasExtra) {
      cols.push('extra');
      params.push(`${p(JSON.stringify(extra))}::jsonb`);
    }
    const updates = cols
      .filter((c) => c !== 'id')
      .map((c) => `${c} = excluded.${c}`)
      .concat(hasExtra ? [] : [`extra = '{}'::jsonb`]);
    return {
      text: `insert into ${op.table} (${cols.join(', ')}) values (${params.join(', ')})
             on conflict (id) do update set ${updates.join(', ')}`,
      values,
    };
  }

  // update / set(merge:true) は部分更新（存在しなければ挿入）
  const assignments = [
    ...columns.map(([c, v]) => `${c} = ${p(v)}`),
    ...increments.map(([c, by]) => `${c} = coalesce(${op.table}.${c}, 0) + ${p(by)}`),
  ];
  if (hasExtra) assignments.push(`extra = ${op.table}.extra || ${p(JSON.stringify(extra))}::jsonb`);

  const insertCols = ['id', ...columns.map(([c]) => c), ...increments.map(([c]) => c)];
  const insertParams = [
    '$1',
    ...columns.map(([, v]) => p(v)),
    ...increments.map(([, by]) => p(by)),
  ];
  if (hasExtra) {
    insertCols.push('extra');
    insertParams.push(`${p(JSON.stringify(extra))}::jsonb`);
  }

  return {
    text: `insert into ${op.table} (${insertCols.join(', ')}) values (${insertParams.join(', ')})
           on conflict (id) do update set ${assignments.join(', ')}`,
    values,
  };
}

async function runWrite(op: WriteOp): Promise<void> {
  const { text, values } = await buildWrite(op);
  await query(text, values);
}

// -------------------------------------------------------------------- 読み取り

/** Firestore の DocumentData 相当（値は any。呼び出し側の型注釈をそのまま活かすため） */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DocumentData = Record<string, any>;

export class DocumentSnapshot {
  constructor(
    public readonly id: string,
    private readonly _data: DocumentData | null,
    public readonly ref: DocumentReference
  ) {}

  get exists(): boolean {
    return this._data !== null;
  }

  data(): DocumentData | undefined {
    return this._data ?? undefined;
  }
}

/** クエリ結果の要素。必ず存在するので data() は non-nullable（Firestore と同じ） */
export class QueryDocumentSnapshot extends DocumentSnapshot {
  override data(): DocumentData {
    return super.data() as DocumentData;
  }
}

export class QuerySnapshot {
  constructor(public readonly docs: QueryDocumentSnapshot[]) {}

  get empty(): boolean {
    return this.docs.length === 0;
  }

  get size(): number {
    return this.docs.length;
  }

  forEach(fn: (doc: QueryDocumentSnapshot) => void): void {
    this.docs.forEach(fn);
  }
}

export class DocumentReference {
  constructor(public readonly table: string, public readonly id: string) {}

  async get(): Promise<DocumentSnapshot> {
    const { rows } = await query(`select * from ${this.table} where id = $1`, [this.id]);
    if (rows.length === 0) return new DocumentSnapshot(this.id, null, this);
    if (JSON_DOC_TABLES.has(this.table)) {
      return new DocumentSnapshot(this.id, (rows[0].data as Record<string, unknown>) ?? {}, this);
    }
    const info = await getTableInfo(this.table);
    return new DocumentSnapshot(this.id, rowToDoc(rows[0], info), this);
  }

  async set(data: Record<string, unknown>, options?: { merge?: boolean }): Promise<void> {
    await runWrite({ kind: 'set', table: this.table, id: this.id, data, merge: options?.merge === true });
  }

  async update(data: Record<string, unknown>): Promise<void> {
    await runWrite({ kind: 'update', table: this.table, id: this.id, data });
  }

  async delete(): Promise<void> {
    await runWrite({ kind: 'delete', table: this.table, id: this.id });
  }
}

type Filter = { field: string; op: string; value: unknown };

const OPERATORS: Record<string, string> = {
  '==': '=',
  '!=': '<>',
  '>': '>',
  '>=': '>=',
  '<': '<',
  '<=': '<=',
};

export class Query {
  constructor(
    protected readonly table: string,
    protected readonly filters: Filter[] = [],
    protected readonly orders: Array<{ field: string; dir: 'asc' | 'desc' }> = [],
    protected readonly limitCount: number | null = null
  ) {}

  where(field: string, op: string, value: unknown): Query {
    return new Query(this.table, [...this.filters, { field, op, value }], this.orders, this.limitCount);
  }

  orderBy(field: string, dir: 'asc' | 'desc' = 'asc'): Query {
    return new Query(this.table, this.filters, [...this.orders, { field, dir }], this.limitCount);
  }

  limit(n: number): Query {
    return new Query(this.table, this.filters, this.orders, n);
  }

  async get(): Promise<QuerySnapshot> {
    const info = await getTableInfo(this.table);
    const values: unknown[] = [];
    const p = (v: unknown) => `$${values.push(v)}`;

    const ref = (field: string): string => {
      const column = info.columns.get(field);
      return column ? column : `extra->>'${field.replace(/'/g, "''")}'`;
    };

    const where = this.filters.map((f) => {
      const lhs = ref(f.field);
      if (f.op === 'in') {
        const list = (f.value as unknown[]) ?? [];
        if (list.length === 0) return 'false';
        return `${lhs} = any(${p(list)})`;
      }
      const sqlOp = OPERATORS[f.op];
      if (!sqlOp) throw new Error(`Unsupported operator: ${f.op}`);
      if (f.value === null) return `${lhs} is ${sqlOp === '=' ? '' : 'not '}null`;
      return `${lhs} ${sqlOp} ${p(toColumnValue(f.value))}`;
    });

    let text = `select * from ${this.table}`;
    if (where.length > 0) text += ` where ${where.join(' and ')}`;
    if (this.orders.length > 0) {
      text += ` order by ${this.orders
        .map((o) => `${ref(o.field)} ${o.dir === 'desc' ? 'desc' : 'asc'} nulls last`)
        .join(', ')}`;
    }
    if (this.limitCount !== null) text += ` limit ${Number(this.limitCount)}`;

    const { rows } = await query(text, values);
    return new QuerySnapshot(
      rows.map((row) => {
        const docRef = new DocumentReference(this.table, row.id as string);
        const data = JSON_DOC_TABLES.has(this.table)
          ? ((row.data as Record<string, unknown>) ?? {})
          : rowToDoc(row, info);
        return new QueryDocumentSnapshot(row.id as string, data, docRef);
      })
    );
  }
}

export class CollectionReference extends Query {
  doc(id?: string): DocumentReference {
    return new DocumentReference(this.table, id || generateId());
  }

  async add(data: Record<string, unknown>): Promise<DocumentReference> {
    const ref = this.doc();
    await ref.set(data);
    return ref;
  }
}

// ---------------------------------------------------------------------- batch

export class WriteBatch {
  private readonly ops: WriteOp[] = [];

  set(ref: DocumentReference, data: Record<string, unknown>, options?: { merge?: boolean }): WriteBatch {
    this.ops.push({ kind: 'set', table: ref.table, id: ref.id, data, merge: options?.merge === true });
    return this;
  }

  update(ref: DocumentReference, data: Record<string, unknown>): WriteBatch {
    this.ops.push({ kind: 'update', table: ref.table, id: ref.id, data });
    return this;
  }

  delete(ref: DocumentReference): WriteBatch {
    this.ops.push({ kind: 'delete', table: ref.table, id: ref.id });
    return this;
  }

  async commit(): Promise<void> {
    if (this.ops.length === 0) return;
    const built = await Promise.all(this.ops.map(buildWrite));
    const client = await getPool().connect();
    try {
      await client.query('begin');
      for (const { text, values } of built) {
        await client.query(text, values);
      }
      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }
}

// ------------------------------------------------------------------- エントリ

export class Database {
  collection(name: string): CollectionReference {
    return new CollectionReference(tableOf(name));
  }

  batch(): WriteBatch {
    return new WriteBatch();
  }
}

export function getDb(): Database {
  return new Database();
}

/** 生 SQL を投げたいとき用（集計など） */
export { query as sql };

// コレクション名（テーブル名は snake_case に自動変換される）
export const COLLECTIONS = {
  USERS: 'users',
  CHECKINS: 'checkins',
  COUPONS: 'coupons',
  COUPON_REDEMPTIONS: 'couponRedemptions',
  MEMBER_TYPES: 'memberTypes',
  USER_MEMBERSHIPS: 'userMemberships',
  REVIEWS: 'reviews',
  EVENTS: 'events',
  SCHOOLS: 'schools',
  EVENT_REGISTRATIONS: 'eventRegistrations',
  SCHOOL_REGISTRATIONS: 'schoolRegistrations',
  ANNOUNCEMENTS: 'announcements',
  MEMBERSHIP_APPLICATIONS: 'membershipApplications',
} as const;
