/**
 * Database client
 * Uses postgres.js — works with both local Postgres and Neon serverless.
 * Neon free tier: 0.5 GB, serverless (scales to zero).
 *
 * For Neon: set DATABASE_URL to the pooler URL (port 5432, not 5433)
 * and add ?sslmode=require to the connection string.
 */
import postgres from 'postgres'

const connectionString = process.env['DATABASE_URL']
if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is required')
}

// Neon serverless works best with a small pool + SSL
const sql = postgres(connectionString, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
  ssl: process.env['NODE_ENV'] === 'production' ? 'require' : false,
  transform: postgres.camel,   // snake_case DB cols → camelCase JS props
})

/**
 * Run a parameterised query returning a single row (or null).
 */
export async function query<T>(
  template: TemplateStringsArray | string,
  ...values: unknown[]
): Promise<T | null> {
  let rows: T[]
  if (typeof template === 'string') {
    rows = await sql.unsafe(template, values as postgres.ParameterOrJSON<never>[]) as T[]
  } else {
    rows = await sql(template, ...values as postgres.ParameterOrJSON<never>[]) as T[]
  }
  return rows[0] ?? null
}

/**
 * Run a parameterised query returning multiple rows.
 */
export async function queryMany<T>(
  template: TemplateStringsArray | string,
  ...values: unknown[]
): Promise<T[]> {
  if (typeof template === 'string') {
    return sql.unsafe(template, values as postgres.ParameterOrJSON<never>[]) as unknown as T[]
  }
  return sql(template, ...values as postgres.ParameterOrJSON<never>[]) as unknown as T[]
}

/**
 * Execute a statement with no meaningful return value (INSERT/UPDATE/DELETE).
 */
export async function execute(
  template: TemplateStringsArray | string,
  ...values: unknown[]
): Promise<void> {
  if (typeof template === 'string') {
    await sql.unsafe(template, values as postgres.ParameterOrJSON<never>[])
  } else {
    await sql(template, ...values as postgres.ParameterOrJSON<never>[])
  }
}

export const db = { query, queryMany, execute, sql }
export default db
