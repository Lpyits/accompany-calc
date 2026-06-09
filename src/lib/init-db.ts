import { select, setSetting, getSetting } from "./db";

const DEFAULT_SETTINGS: Record<string, string> = {
  platform_commission: "0.125",
  redpacket_tiers: JSON.stringify([
    { max: 10, rate: 0 },
    { min: 10, max: 50, rate: 0.2 },
    { min: 50, max: 500, rate: 0.3 },
    { min: 500, rate: 0.4 },
  ]),
  deposit_gift_rule: JSON.stringify({ threshold: "10", gift: "1" }),
  default_unit_price: "40",
  deposit_unit_price: "30",
  personal_unit_price: "30",
};

export async function initDatabase(): Promise<void> {
  // 检查 settings 是否存在
  const count = await select<{ cnt: number }>(
    "SELECT COUNT(*) as cnt FROM settings"
  );

  if (Array.isArray(count) && count.length > 0 && count[0].cnt > 0) {
    // DB 已有数据：仅补充缺失的默认配置
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
      const existing = await getSetting(key);
      if (existing === null) {
        await setSetting(key, value);
      }
    }
  } else {
    // DB 首次初始化：写入全部默认配置
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
      await setSetting(key, value);
    }
  }
  // 表结构由 Rust 端 tauri-plugin-sql migrations 管理，前端不操作 DDL
}
