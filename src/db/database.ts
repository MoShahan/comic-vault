import * as SQLite from 'expo-sqlite';

/** Single shared open promise so concurrent getDb() callers share one migration. */
let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function openAndMigrate(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync('comicvault.db');
  await db.execAsync(`
        PRAGMA journal_mode = WAL;

        CREATE TABLE IF NOT EXISTS comics (
          id TEXT PRIMARY KEY NOT NULL,
          title TEXT NOT NULL,
          series TEXT,
          sourceUri TEXT,
          sourceFileName TEXT,
          coverPath TEXT NOT NULL,
          pagesDir TEXT NOT NULL,
          pageCount INTEGER NOT NULL,
          currentPage INTEGER NOT NULL DEFAULT 0,
          spreadHalf TEXT NOT NULL DEFAULT 'full',
          isRead INTEGER NOT NULL DEFAULT 0,
          isFavorite INTEGER NOT NULL DEFAULT 0,
          fitMode TEXT NOT NULL DEFAULT 'screen',
          readingDirection TEXT NOT NULL DEFAULT 'ltr',
          lastReadAt INTEGER,
          importedAt INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY NOT NULL,
          value TEXT NOT NULL
        );
      `);

  // Lightweight forward migrations for installs that predate new columns.
  const comicCols = await db.getAllAsync<{ name: string }>('PRAGMA table_info(comics)');
  if (!comicCols.some((col) => col.name === 'sourceFileName')) {
    await db.execAsync('ALTER TABLE comics ADD COLUMN sourceFileName TEXT');
  }

  return db;
}

/** Opens (and migrates) the library DB; safe to call from multiple boot paths. */
export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = openAndMigrate().catch((error) => {
      // Clear so a later getDb() / Retry can try again after a failed open.
      dbPromise = null;
      throw error;
    });
  }
  return dbPromise;
}
