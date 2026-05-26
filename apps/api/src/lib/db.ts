import "dotenv/config"
import postgres from 'postgres'

const connectionString = process.env['DATABASE_URL']
if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is required')
}

const sql = postgres(connectionString, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
  ssl: connectionString.includes('sslmode=require') ? 'require' : false,
  transform: postgres.camel,
})

export async function query<T>(text: string, ...values: unknown[]): Promise<T | null> {
  const rows = await sql.unsafe(text, values as never[]) as T[]
  return rows[0] ?? null
}

export async function queryMany<T>(text: string, ...values: unknown[]): Promise<T[]> {
  return sql.unsafe(text, values as never[]) as unknown as T[]
}

export async function execute(text: string, ...values: unknown[]): Promise<void> {
  await sql.unsafe(text, values as never[])
}

export const db = { query, queryMany, execute, sql }
export default db
