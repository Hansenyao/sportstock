import { Pool, QueryResult, QueryResultRow, QueryConfig } from 'pg';
import config from '../config';

const pool = new Pool({
  connectionString: config.db.connectionString,
  ssl: { rejectUnauthorized: false },
  max: 5, // keep low for serverless — each function instance has its own pool
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

export function query<T extends QueryResultRow = QueryResultRow>(
  text: string | QueryConfig,
  params?: unknown[]
): Promise<QueryResult<T>> {
  return pool.query<T>(text as string, params);
}

export { pool };
