import { Pool } from 'pg';

const globalForDb = globalThis as unknown as { pool?: Pool };
export const db = globalForDb.pool ?? new Pool({ connectionString: process.env.DATABASE_URL, max: 10, idleTimeoutMillis: 30_000 });
if (process.env.NODE_ENV !== 'production') globalForDb.pool = db;
