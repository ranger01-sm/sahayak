
const initSqlJs = require("sql.js");
const path = require("path");
const fs   = require("fs");
require("dotenv").config();

const DB_PATH = path.resolve(process.env.DB_PATH || "./sahayak.db");
let db;

async function getDb() {
  if (db) return db;
  const SQL = await initSqlJs();
  if (fs.existsSync(DB_PATH)) {
    db = new SQL.Database(fs.readFileSync(DB_PATH));
  } else {
    db = new SQL.Database();
  }
  db.run("PRAGMA foreign_keys = ON");
  console.log("✅ sql.js DB ready");
  return db;
}

function persist() {
  if (db) fs.writeFileSync(DB_PATH, Buffer.from(db.export()));
}

// Wrap sql.js into async-style helpers
async function run(sql, params = []) {
  const d = await getDb();
  d.run(sql, params);
  persist();
  return {};
}

async function get(sql, params = []) {
  const d = await getDb();
  const stmt = d.prepare(sql);
  stmt.bind(params);
  const row = stmt.step() ? stmt.getAsObject() : null;
  stmt.free();
  return row;
}

async function all(sql, params = []) {
  const d = await getDb();
  const stmt = d.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

async function initSchema() {
  await run(`CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, phone TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE, password TEXT NOT NULL, role TEXT DEFAULT 'customer',
    created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
  )`);
  await run(`CREATE TABLE IF NOT EXISTS workers (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, phone TEXT UNIQUE NOT NULL,
    email TEXT, password TEXT NOT NULL, age INTEGER, gender TEXT,
    experience_yrs TEXT, expected_pay TEXT, about TEXT,
    aadhaar_url TEXT, photo_url TEXT,
    lat REAL, lng REAL, society TEXT, city TEXT DEFAULT 'Surat', full_address TEXT,
    status TEXT DEFAULT 'pending', is_online INTEGER DEFAULT 0,
    rating REAL DEFAULT 0, rating_count INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
  )`);
  await run(`CREATE TABLE IF NOT EXISTS worker_skills (
    worker_id TEXT NOT NULL, skill TEXT NOT NULL, PRIMARY KEY (worker_id, skill)
  )`);
  await run(`CREATE TABLE IF NOT EXISTS worker_availability (
    worker_id TEXT NOT NULL, day TEXT NOT NULL, from_time TEXT, until_time TEXT,
    PRIMARY KEY (worker_id, day)
  )`);
  await run(`CREATE TABLE IF NOT EXISTS bookings (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, worker_id TEXT,
    service TEXT NOT NULL, frequency TEXT, start_date TEXT,
    preferred_time TEXT, requirements TEXT, budget TEXT,
    cust_lat REAL, cust_lng REAL,
    cust_society TEXT, cust_city TEXT, cust_address TEXT,
    status TEXT DEFAULT 'pending', payment_status TEXT DEFAULT 'unpaid',
    payment_method TEXT, payment_id TEXT, amount_paid REAL,
    created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
  )`);
  await run(`CREATE TABLE IF NOT EXISTS payments (
    id TEXT PRIMARY KEY, booking_id TEXT NOT NULL, user_id TEXT NOT NULL,
    razorpay_order_id TEXT, razorpay_payment_id TEXT, razorpay_signature TEXT,
    amount REAL NOT NULL, currency TEXT DEFAULT 'INR', method TEXT,
    status TEXT DEFAULT 'created', created_at TEXT DEFAULT (datetime('now'))
  )`);
  await run(`CREATE TABLE IF NOT EXISTS reviews (
    id TEXT PRIMARY KEY, booking_id TEXT NOT NULL, user_id TEXT NOT NULL,
    worker_id TEXT NOT NULL,
    rating INTEGER NOT NULL, comment TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )`);
  await run(`CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY, user_id TEXT, worker_id TEXT,
    type TEXT NOT NULL, title TEXT NOT NULL, body TEXT,
    is_read INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now'))
  )`);
  console.log("✅ Schema ready");
}

module.exports = { getDb, run, get, all, initSchema };
