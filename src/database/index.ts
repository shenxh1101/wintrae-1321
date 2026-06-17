import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';

const dbPath = path.resolve(__dirname, '../../data/gym.db');
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

export const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

console.log('数据库连接成功');
initTables();

function initTables() {
  const createTablesSQL = [
    `CREATE TABLE IF NOT EXISTS stores (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      address TEXT NOT NULL,
      phone TEXT NOT NULL,
      business_hours TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open'
    )`,
    `CREATE TABLE IF NOT EXISTS members (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT NOT NULL UNIQUE,
      email TEXT,
      avatar TEXT,
      password TEXT NOT NULL,
      membership_type TEXT NOT NULL,
      membership_start TEXT NOT NULL,
      membership_end TEXT NOT NULL,
      remaining_count INTEGER NOT NULL DEFAULT 0,
      total_count INTEGER NOT NULL DEFAULT 0,
      points INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS courses (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      type TEXT NOT NULL,
      duration INTEGER NOT NULL,
      difficulty TEXT NOT NULL,
      calories INTEGER NOT NULL DEFAULT 0,
      cover_image TEXT,
      created_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS coaches (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      avatar TEXT,
      title TEXT NOT NULL,
      specialties TEXT NOT NULL,
      introduction TEXT,
      rating REAL NOT NULL DEFAULT 5.0,
      experience_years INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS coach_schedules (
      id TEXT PRIMARY KEY,
      coach_id TEXT NOT NULL,
      course_id TEXT NOT NULL,
      store_id TEXT NOT NULL,
      date TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      capacity INTEGER NOT NULL DEFAULT 20,
      booked_count INTEGER NOT NULL DEFAULT 0,
      waitlist_count INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'scheduled',
      created_at TEXT NOT NULL,
      FOREIGN KEY (coach_id) REFERENCES coaches(id),
      FOREIGN KEY (course_id) REFERENCES courses(id),
      FOREIGN KEY (store_id) REFERENCES stores(id)
    )`,
    `CREATE TABLE IF NOT EXISTS bookings (
      id TEXT PRIMARY KEY,
      member_id TEXT NOT NULL,
      schedule_id TEXT NOT NULL,
      status TEXT NOT NULL,
      check_in_code TEXT,
      check_in_time TEXT,
      is_waitlist INTEGER NOT NULL DEFAULT 0,
      waitlist_position INTEGER,
      points_change INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      cancelled_at TEXT,
      cancel_reason TEXT,
      FOREIGN KEY (member_id) REFERENCES members(id),
      FOREIGN KEY (schedule_id) REFERENCES coach_schedules(id)
    )`,
    `CREATE TABLE IF NOT EXISTS reviews (
      id TEXT PRIMARY KEY,
      booking_id TEXT NOT NULL UNIQUE,
      member_id TEXT NOT NULL,
      schedule_id TEXT NOT NULL,
      coach_id TEXT NOT NULL,
      rating INTEGER NOT NULL,
      content TEXT,
      images TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (booking_id) REFERENCES bookings(id),
      FOREIGN KEY (member_id) REFERENCES members(id),
      FOREIGN KEY (schedule_id) REFERENCES coach_schedules(id),
      FOREIGN KEY (coach_id) REFERENCES coaches(id)
    )`,
    `CREATE TABLE IF NOT EXISTS points_records (
      id TEXT PRIMARY KEY,
      member_id TEXT NOT NULL,
      change INTEGER NOT NULL,
      type TEXT NOT NULL,
      description TEXT NOT NULL,
      related_booking_id TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (member_id) REFERENCES members(id),
      FOREIGN KEY (related_booking_id) REFERENCES bookings(id)
    )`,
    `CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      member_id TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY (member_id) REFERENCES members(id)
    )`
  ];

  const createIndexSQL = [
    `CREATE INDEX IF NOT EXISTS idx_bookings_member ON bookings(member_id)`,
    `CREATE INDEX IF NOT EXISTS idx_bookings_schedule ON bookings(schedule_id)`,
    `CREATE INDEX IF NOT EXISTS idx_schedules_coach ON coach_schedules(coach_id)`,
    `CREATE INDEX IF NOT EXISTS idx_schedules_course ON coach_schedules(course_id)`,
    `CREATE INDEX IF NOT EXISTS idx_schedules_date ON coach_schedules(date)`
  ];

  const transaction = db.transaction(() => {
    for (const sql of createTablesSQL) {
      db.exec(sql);
    }
    for (const sql of createIndexSQL) {
      db.exec(sql);
    }
  });

  transaction();
}

export function runSQL(sql: string, params: any[] = []): any {
  const stmt = db.prepare(sql);
  const result = stmt.run(...params);
  return { lastID: result.lastInsertRowid, changes: result.changes };
}

export function getOne<T = any>(sql: string, params: any[] = []): T | null {
  const stmt = db.prepare(sql);
  const result = stmt.get(...params) as T | undefined;
  return result || null;
}

export function getAll<T = any>(sql: string, params: any[] = []): T[] {
  const stmt = db.prepare(sql);
  return (stmt.all(...params) as T[]) || [];
}

export function beginTransaction(): void {
  db.exec('BEGIN TRANSACTION');
}

export function commit(): void {
  db.exec('COMMIT');
}

export function rollback(): void {
  db.exec('ROLLBACK');
}

export function transaction<T>(fn: () => T): T {
  const tx = db.transaction(fn);
  return tx();
}
