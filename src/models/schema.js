const { run } = require('../config/database');

async function initSchema() {
  // Users table (customers + workers share auth)
  await run(`CREATE TABLE IF NOT EXISTS users (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid       TEXT    NOT NULL UNIQUE,
    name       TEXT    NOT NULL,
    phone      TEXT    NOT NULL UNIQUE,
    email      TEXT    UNIQUE,
    password   TEXT    NOT NULL,
    role       TEXT    NOT NULL CHECK(role IN ('customer','worker','admin')),
    is_active  INTEGER NOT NULL DEFAULT 1,
    created_at TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT    NOT NULL DEFAULT (datetime('now'))
  )`);

  // Worker profiles
  await run(`CREATE TABLE IF NOT EXISTS worker_profiles (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    gender          TEXT,
    age             INTEGER,
    skills          TEXT    NOT NULL DEFAULT '[]',   -- JSON array of skill strings
    experience_yrs  TEXT,
    expected_pay    TEXT,
    available_days  TEXT    NOT NULL DEFAULT '[]',   -- JSON array
    available_from  TEXT,
    available_until TEXT,
    about           TEXT,
    aadhaar_path    TEXT,
    photo_path      TEXT,
    lat             REAL,
    lng             REAL,
    is_verified     INTEGER NOT NULL DEFAULT 0,
    is_online       INTEGER NOT NULL DEFAULT 0,
    rating          REAL    NOT NULL DEFAULT 0,
    total_ratings   INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
  )`);

  // Services catalogue
  await run(`CREATE TABLE IF NOT EXISTS services (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL UNIQUE,
    icon        TEXT,
    price       REAL    NOT NULL,
    price_unit  TEXT    NOT NULL DEFAULT 'per visit',
    description TEXT,
    is_active   INTEGER NOT NULL DEFAULT 1
  )`);

  // Bookings
  await run(`CREATE TABLE IF NOT EXISTS bookings (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid           TEXT    NOT NULL UNIQUE,
    customer_id    INTEGER NOT NULL REFERENCES users(id),
    worker_id      INTEGER REFERENCES worker_profiles(id),
    service_id     INTEGER REFERENCES services(id),
    service_name   TEXT    NOT NULL,
    frequency      TEXT,
    start_date     TEXT,
    preferred_time TEXT,
    requirements   TEXT,
    address        TEXT,
    lat            REAL,
    lng            REAL,
    budget         TEXT,
    status         TEXT    NOT NULL DEFAULT 'pending'
                           CHECK(status IN ('pending','assigned','in_progress','completed','cancelled')),
    created_at     TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at     TEXT    NOT NULL DEFAULT (datetime('now'))
  )`);

  // Payments
  await run(`CREATE TABLE IF NOT EXISTS payments (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid           TEXT    NOT NULL UNIQUE,
    booking_id     INTEGER NOT NULL REFERENCES bookings(id),
    amount         REAL    NOT NULL,
    method         TEXT    NOT NULL,
    status         TEXT    NOT NULL DEFAULT 'pending'
                           CHECK(status IN ('pending','processing','success','failed','refunded')),
    gateway_ref    TEXT,
    created_at     TEXT    NOT NULL DEFAULT (datetime('now'))
  )`);

  // Reviews
  await run(`CREATE TABLE IF NOT EXISTS reviews (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    booking_id  INTEGER NOT NULL UNIQUE REFERENCES bookings(id),
    customer_id INTEGER NOT NULL REFERENCES users(id),
    worker_id   INTEGER NOT NULL REFERENCES worker_profiles(id),
    rating      INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
    comment     TEXT,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
  )`);

  // Worker location updates (latest snapshot)
  await run(`CREATE TABLE IF NOT EXISTS worker_locations (
    worker_id  INTEGER PRIMARY KEY REFERENCES worker_profiles(id),
    lat        REAL    NOT NULL,
    lng        REAL    NOT NULL,
    updated_at TEXT    NOT NULL DEFAULT (datetime('now'))
  )`);

  console.log('Database schema ready');
}

module.exports = { initSchema };
