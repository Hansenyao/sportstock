import { Pool, QueryResult, QueryResultRow, QueryConfig, types } from 'pg';
import config from '../config';

// Return DATE as a plain "YYYY-MM-DD" string instead of a JS Date object.
// This prevents timezone-offset shifts when the frontend parses date-only values.
types.setTypeParser(1082, (val: string) => val);

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
