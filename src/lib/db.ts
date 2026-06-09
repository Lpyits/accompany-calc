import Database from "@tauri-apps/plugin-sql";
import Decimal from "decimal.js";

/** 格式化时长/数字：最多5位小数，整数时补 .0，无千位分隔 */
export function fmtDecimal(d: Decimal): string {
  const s = d.toDecimalPlaces(5).toString();
  if (!s.includes(".")) return s + ".0";
  return s;
}

/** 格式化金额：千位分隔符 + 最多5位小数 + 整数补 .0 */
export function fmtMoney(d: Decimal): string {
  const s = d.toDecimalPlaces(5).toString();
  const parts = s.split(".");
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  let result = parts.join(".");
  if (!result.includes(".")) result += ".0";
  return result;
}

let dbInstance: Database | null = null;

async function getDb(): Promise<Database> {
  if (!dbInstance) {
    try {
      dbInstance = await Database.load("sqlite:app.db");
    } catch {
      // 首次加载失败（如文件被删），重试一次让 Rust 重建
      dbInstance = await Database.load("sqlite:app.db");
    }
  }
  return dbInstance;
}

export async function execute(sql: string, params: (string | number)[] = []): Promise<void> {
  try {
    const db = await getDb();
    await db.execute(sql, params);
  } catch {
    // 连接断开时清缓存并重试一次
    dbInstance = null;
    const db = await getDb();
    await db.execute(sql, params);
  }
}

export async function select<T = Record<string, unknown>>(
  sql: string,
  params: (string | number)[] = []
): Promise<T[]> {
  try {
    const db = await getDb();
    const result = await db.select<T[]>(sql, params);
    return result as unknown as T[];
  } catch {
    dbInstance = null;
    const db = await getDb();
    const result = await db.select<T[]>(sql, params);
    return result as unknown as T[];
  }
}

export async function getSetting(key: string): Promise<string | null> {
  const rows = await select<{ value: string }>(
    "SELECT value FROM settings WHERE key = ?",
    [key]
  );
  if (!rows || rows.length === 0) return null;
  return rows[0].value;
}

export async function setSetting(key: string, value: string): Promise<void> {
  await execute(
    "INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now','localtime')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
    [key, value]
  );
}

export async function closeDb(): Promise<void> {
  if (dbInstance) {
    // dbInstance.close is not exposed; just nullify
    dbInstance = null;
  }
}
