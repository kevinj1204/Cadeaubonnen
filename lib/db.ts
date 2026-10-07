import { Pool, type PoolClient, type QueryResultRow } from "pg";

declare global {
  // eslint-disable-next-line no-var
  var __tlpPool: Pool | undefined;
}

function createPool() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL ontbreekt. Zie README › Environment variables.");
  }
  const isLocal = /localhost|127\.0\.0\.1/.test(connectionString);
  const p = new Pool({
    connectionString,
    ssl: isLocal ? undefined : { rejectUnauthorized: false },
    max: 5,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
  });
  return p;
}

export function pool(): Pool {
  if (!global.__tlpPool) global.__tlpPool = createPool();
  return global.__tlpPool;
}

export async function query<T extends QueryResultRow = any>(text: string, params: unknown[] = []) {
  const res = await pool().query<T>(text, params);
  return res.rows;
}

export async function queryOne<T extends QueryResultRow = any>(text: string, params: unknown[] = []) {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

/** Voert fn uit binnen één database-transactie (alles of niets). */
export async function tx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export async function logEvent(
  db: { query: PoolClient["query"] } | null,
  e: { orderId?: string | null; voucherId?: string | null; type: string; message: string; actor?: string; data?: unknown },
) {
  const sql =
    "INSERT INTO events (order_id, voucher_id, type, message, actor, data) VALUES ($1,$2,$3,$4,$5,$6)";
  const params = [e.orderId ?? null, e.voucherId ?? null, e.type, e.message, e.actor ?? "system", e.data ? JSON.stringify(e.data) : null];
  if (db) await db.query(sql, params);
  else await query(sql, params);
}
