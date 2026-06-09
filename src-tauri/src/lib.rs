use tauri_plugin_sql::{Migration, MigrationKind};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![
        Migration {
            version: 1,
            description: "create initial tables",
            sql: "CREATE TABLE IF NOT EXISTS customers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                created_at TEXT DEFAULT (datetime('now','localtime'))
            );
            CREATE TABLE IF NOT EXISTS deposits (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                customer_id INTEGER NOT NULL,
                unit_price TEXT NOT NULL,
                deposit_amount TEXT NOT NULL,
                actual_hours TEXT NOT NULL,
                gift_hours TEXT NOT NULL,
                actual_amount TEXT NOT NULL,
                gift_amount TEXT NOT NULL,
                remaining_actual_hours TEXT NOT NULL,
                remaining_gift_hours TEXT NOT NULL,
                created_at TEXT DEFAULT (datetime('now','localtime'))
            );
            CREATE TABLE IF NOT EXISTS consumptions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                customer_id INTEGER NOT NULL,
                hours_used TEXT NOT NULL,
                actual_deducted TEXT NOT NULL,
                gift_deducted TEXT NOT NULL,
                created_at TEXT DEFAULT (datetime('now','localtime'))
            );
            CREATE TABLE IF NOT EXISTS income_records (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                source TEXT NOT NULL,
                gross_amount TEXT NOT NULL,
                platform_fee TEXT NOT NULL,
                net_amount TEXT NOT NULL,
                type TEXT NOT NULL CHECK(type IN ('platform','deposit','redpacket','personal')),
                record_date TEXT NOT NULL,
                created_at TEXT DEFAULT (datetime('now','localtime'))
            );
            CREATE TABLE IF NOT EXISTS settings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                key TEXT UNIQUE NOT NULL,
                value TEXT NOT NULL,
                updated_at TEXT DEFAULT (datetime('now','localtime'))
            );",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "add personal type to income_records",
            sql: "CREATE TABLE IF NOT EXISTS income_records_new (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                source TEXT NOT NULL,
                gross_amount TEXT NOT NULL,
                platform_fee TEXT NOT NULL,
                net_amount TEXT NOT NULL,
                type TEXT NOT NULL CHECK(type IN ('platform','deposit','redpacket','personal')),
                record_date TEXT NOT NULL,
                created_at TEXT DEFAULT (datetime('now','localtime'))
            );
            INSERT OR IGNORE INTO income_records_new SELECT * FROM income_records;
            DROP TABLE IF EXISTS income_records;
            ALTER TABLE income_records_new RENAME TO income_records;",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "add remark column to customers",
            sql: "ALTER TABLE customers ADD COLUMN remark TEXT DEFAULT '';",
            kind: MigrationKind::Up,
        },
    ];

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:app.db", migrations)
                .build(),
        )
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
