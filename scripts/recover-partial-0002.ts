import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const migrationFile = resolve(projectRoot, "drizzle/0002_phase1_intelligence_expansion.sql");
const journalFile = resolve(projectRoot, "drizzle/meta/_journal.json");
const migrationSql = await readFile(migrationFile, "utf8");
const journal = JSON.parse(await readFile(journalFile, "utf8"));
const entry = journal.entries.find((row: { tag: string }) => row.tag === "0002_phase1_intelligence_expansion");
if (!entry) throw new Error("Migration 0002 is absent from the Drizzle journal.");
if (!process.env.DATABASE_URL) throw new Error("Managed DATABASE_URL is unavailable.");

const connection = await mysql.createConnection(process.env.DATABASE_URL);
const hash = createHash("sha256").update(migrationSql).digest("hex");
const statements = migrationSql.split(/-->\s*statement-breakpoint/g).map(statement => statement.trim()).filter(Boolean);

async function exists(query: string, values: unknown[]) {
  const [rows] = await connection.query(query, values);
  return (rows as any[]).length > 0;
}

async function applyIfMissing(statement: string, index: number) {
  let match = statement.match(/^CREATE TABLE\s+`([^`]+)`/i);
  if (match) {
    if (await exists("SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?", [match[1]])) return "table already present";
    await connection.query(statement);
    return "created table";
  }

  match = statement.match(/^ALTER TABLE\s+`([^`]+)`\s+ADD\s+`([^`]+)`/i);
  if (match) {
    if (await exists("SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?", [match[1], match[2]])) return "column already present";
    await connection.query(statement);
    return "added column";
  }

  match = statement.match(/^ALTER TABLE\s+`([^`]+)`\s+MODIFY COLUMN\s+`([^`]+)`\s+(.+?)(?:;)?$/is);
  if (match) {
    const [, table, column, definition] = match;
    const [rows] = await connection.query("SELECT COLUMN_TYPE AS columnType FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?", [table, column]);
    const current = (rows as any[])[0]?.columnType;
    if (!current) throw new Error(`Expected column ${table}.${column} is missing.`);
    const desiredType = definition.trim().replace(/\s+NOT NULL.*$/i, "").replace(/\s+DEFAULT.*$/i, "").toLowerCase().replace(/\s+/g, "");
    const currentType = String(current).toLowerCase().replace(/\s+/g, "");
    if (currentType === desiredType) return "column type already updated";
    const [countRows] = await connection.query(`SELECT COUNT(*) AS rowCount FROM \`${table}\``);
    if (Number((countRows as any[])[0]?.rowCount ?? 0) > 0) throw new Error(`Refusing to alter ${table}.${column}; rows exist and the type does not match.`);
    await connection.query(statement);
    return "updated empty-table enum";
  }

  match = statement.match(/^ALTER TABLE\s+`([^`]+)`\s+ADD CONSTRAINT\s+`([^`]+)`/i);
  if (match) {
    if (await exists("SELECT 1 FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ?", [match[1], match[2]])) return "constraint already present";
    await connection.query(statement);
    return "added foreign key";
  }

  match = statement.match(/^CREATE INDEX\s+`([^`]+)`\s+ON\s+`([^`]+)`/i);
  if (match) {
    if (await exists("SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?", [match[2], match[1]])) return "index already present";
    await connection.query(statement);
    return "created index";
  }

  throw new Error(`Refusing unsupported migration statement ${index + 1}; manual review is required.`);
}

try {
  const recorded = await exists("SELECT 1 FROM `__drizzle_migrations` WHERE `hash` = ?", [hash]);
  if (recorded) {
    console.log("Migration 0002 is already recorded; no DDL was changed.");
  } else {
    for (const [index, statement] of statements.entries()) {
      const outcome = await applyIfMissing(statement, index);
      console.log(`[${index + 1}/${statements.length}] ${outcome}`);
    }
    await connection.execute(
      "INSERT INTO `__drizzle_migrations` (`hash`, `created_at`) SELECT ?, ? WHERE NOT EXISTS (SELECT 1 FROM `__drizzle_migrations` WHERE `hash` = ?)",
      [hash, entry.when, hash],
    );
    console.log("Migration 0002 was recorded after all missing DDL completed.");
  }
} finally {
  await connection.end();
}
