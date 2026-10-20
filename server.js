
require('dotenv').config();
'use strict';

const express = require('express');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const Database = require('better-sqlite3');
const {
  validateSlot,
  overlaps,
  toUtcIso,
  MAX_DAILY_DESK_BOOKINGS
} = require('./booking-rules');

const app = express();

// Railway reverse proxy configuration
app.set('trust proxy', 1);

const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET =
  process.env.JWT_SECRET || 'local-development-secret-change-me';
const DB_PATH =
  process.env.DB_PATH || path.join(__dirname, 'data', 'deskspot.sqlite');

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('Employee','Admin')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS offices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    city TEXT NOT NULL,
    time_zone TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS spaces (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    office_id INTEGER NOT NULL REFERENCES offices(id),
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('Desk','Room')),
    capacity INTEGER NOT NULL DEFAULT 1 CHECK(capacity >= 1),
    is_active INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    space_id INTEGER NOT NULL REFERENCES spaces(id),
    user_id INTEGER NOT NULL REFERENCES users(id),
    start_utc TEXT NOT NULL,
    end_utc TEXT NOT NULL,
    local_date TEXT NOT NULL,
    start_local TEXT NOT NULL,
    end_local TEXT NOT NULL,
    attendees INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'Active'
      CHECK(status IN ('Active','Cancelled')),
    cancel_reason TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_bookings_space_time
    ON bookings(space_id, start_utc, end_utc, status);

  CREATE INDEX IF NOT EXISTS idx_bookings_user_time
    ON bookings(user_id, start_utc, status);
`);

function seed() {
  if (db.prepare('SELECT COUNT(*) n FROM offices').get().n) {
    return;
  }

  const officeInsert = db.prepare(
    'INSERT INTO offices(name, city, time_zone) VALUES(?,?,?)'
  );

  const offices = [
    ['Islamabad HQ', 'Islamabad', 'Asia/Karachi'],
    ['Riyadh Office', 'Riyadh', 'Asia/Riyadh'],
    ['Copenhagen Studio', 'Copenhagen', 'Europe/Copenhagen']
  ];

  const officeIds = offices.map(office =>
    Number(officeInsert.run(...office).lastInsertRowid)
  );

  const spaceInsert = db.prepare(
    'INSERT INTO spaces(office_id, name, type, capacity) VALUES(?,?,?,?)'
  );

  [
    ['Focus Desk 01', 'Desk', 1],
    ['Focus Desk 02', 'Desk', 1],
    ['Window Desk 03', 'Desk', 1],
    ['Quiet Desk 04', 'Desk', 1],
    ['Team Room A', 'Room', 6],
    ['Board Room B', 'Room', 10],
    ['Focus Desk 05', 'Desk', 1],
    ['Focus Desk 06', 'Desk', 1],
    ['Collab Room C', 'Room', 4],
    ['Focus Desk 07', 'Desk', 1]
  ].forEach((space, index) => {
    spaceInsert.run(officeIds[index % 3], ...space);
  });

  const userInsert = db.prepare(
    'INSERT INTO users(email, password_hash, full_name, role) VALUES(?,?,?,?)'
  );

  userInsert.run(
    'admin@deskspot.local',
    bcrypt.hashSync('Admin123!', 10),
    'DeskSpot Admin',
    'Admin'
  );

  userInsert.run(
    'employee@deskspot.local',
    bcrypt.hashSync('Employee123!', 10),
    'Alex Morgan',
    'Employee'
  );

  userInsert.run(
    'sam@deskspot.local',
    bcrypt.hashSync('Employee123!', 10),
    'Sam Taylor',
    'Employee'
  );
}

seed();

// General middleware
app.disable('x-powered-by');

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: [
          "'self'",
          "'unsafe-inline'",
          'https://fonts.googleapis.com'
        ],
        fontSrc: [
          "'self'",
          'https://fonts.gstatic.com'
        ],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:']
      }
    }
  })
);

app.use(express.json({ limit: '100kb' }));

app.use((req, res, next) => {
  const origin = process.env.APP_ORIGIN;

  if (origin && req.headers.origin === origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type,Authorization'
    );
    res.setHeader(
      'Access-Control-Allow-Methods',
      'GET,POST,PUT,DELETE,OPTIONS'
    );
  }

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }

  next();
});

app.use(express.static(path.join(__dirname, 'public')));

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    error: 'Too many login attempts. Please try again later.'
  }
});

const asyncRoute = fn =>
  (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);

const fail = (res, status, error, details) =>
  res.status(status).json({
    error,
    ...(details ? { details } : {})
  });

function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ')
    ? header.slice(7)
    : null;

  if (!token) {
    return fail(res, 401, 'Authentication required.');
  }

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return fail(res, 401, 'Session expired or invalid. Please sign in again.');
  }
}

function admin(req, res, next) {
  if (req.user.role !== 'Admin') {
    return fail(res, 403, 'Administrator access required.');
  }

  next();
}

function cleanText(value, max = 100) {
  return typeof value === 'string'
    ? value.trim().slice(0, max)
    : '';
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function listQuery(sql, params = []) {
  return db.prepare(sql).all(...params);
}

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    time: new Date().toISOString()
  });
});

// API documentation
app.get('/api/openapi.json', (req, res) => {
  res.json({
    openapi: '3.0.3',
    info: {
      title: 'DeskSpot API',
      version: '1.0.0',
      description: 'Desk and meeting-room booking portal API'
    },
    servers: [{ url: '/api' }],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        }
      }
    },
    paths: {
      '/auth/register': {
        post: {
          summary: 'Register employee account',
          responses: {
            '201': { description: 'Account created' },
            '400': { description: 'Validation error' },
            '409': { description: 'Email already exists' }
          }
        }
      },
      '/auth/login': {
        post: {
          summary: 'Sign in',
          responses: {
            '200': { description: 'JWT and user' },
            '401': { description: 'Invalid credentials' }
          }
        }
      },
      '/offices': {
        get: {
          summary: 'List active offices',
          security: [{ bearerAuth: [] }],
          responses: {
            '200': { description: 'Office list' }
          }
        },
        post: {
          summary: 'Create office (admin)',
          security: [{ bearerAuth: [] }],
          responses: {
            '201': { description: 'Office created' },
            '403': { description: 'Admin required' }
          }
        }
      },
      '/availability': {
        get: {
          summary: 'Search available spaces',
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: 'officeId',
              in: 'query',
              required: true,
              schema: { type: 'integer' }
            },
            {
              name: 'date',
              in: 'query',
              required: true,
              schema: { type: 'string', format: 'date' }
            },
            {
              name: 'from',
              in: 'query',
              required: true,
              schema: { type: 'string', example: '09:00' }
            },
            {
              name: 'to',
              in: 'query',
              required: true,
              schema: { type: 'string', example: '10:00' }
            },
            {
              name: 'type',
              in: 'query',
              schema: { type: 'string', enum: ['Desk', 'Room'] }
            }
          ],
          responses: {
            '200': { description: 'Available spaces' },
            '400': { description: 'Invalid slot' }
          }
        }
      },
      '/bookings': {
        post: {
          summary: 'Create a booking',
          security: [{ bearerAuth: [] }],
          responses: {
            '201': { description: 'Booking confirmed' },
            '400': { description: 'Business rule validation failed' },
            '409': { description: 'Overlapping booking' }
          }
        }
      },
      '/bookings/me': {
        get: {
          summary: 'List current user bookings',
          security: [{ bearerAuth: [] }],
          responses: {
            '200': { description: 'Bookings' }
          }
        }
      },
      '/bookings/{id}': {
        delete: {
          summary: 'Cancel booking',
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'integer' }
            }
          ],
          responses: {
            '200': { description: 'Cancelled' },
            '403': { description: 'Not booking owner' },
            '404': { description: 'Not found' }
          }
        }
      },
      '/admin/occupancy': {
        get: {
          summary: 'Office occupancy by local date (admin)',
          security: [{ bearerAuth: [] }],
          responses: {
            '200': { description: 'Occupancy' },
            '403': { description: 'Admin required' }
          }
        }
      }
    }
  });
});

// Employee registration
app.post('/api/auth/register', asyncRoute(async (req, res) => {
  const fullName = cleanText(req.body.fullName, 80);
  const email = cleanText(req.body.email, 160).toLowerCase();
  const password = String(req.body.password || '');

  if (
    fullName.length < 2 ||
    !validEmail(email) ||
    password.length < 8
  ) {
    return fail(
      res,
      400,
      'Please provide a name, a valid email, and a password of at least 8 characters.'
    );
  }

  try {
    const hash = await bcrypt.hash(password, 10);

    const result = db.prepare(
      "INSERT INTO users(email, password_hash, full_name, role) VALUES(?,?,?,'Employee')"
    ).run(email, hash, fullName);

    const user = {
      id: Number(result.lastInsertRowid),
      email,
      fullName,
      role: 'Employee'
    };

    const token = jwt.sign(user, JWT_SECRET, { expiresIn: '8h' });

    res.status(201).json({ token, user });
  } catch (error) {
    if (String(error.message).includes('UNIQUE')) {
      return fail(res, 409, 'An account with this email already exists.');
    }

    throw error;
  }
}));

// Login
app.post('/api/auth/login', loginLimiter, asyncRoute(async (req, res) => {
  const email = cleanText(req.body.email, 160).toLowerCase();
  const password = String(req.body.password || '');

  const user = db.prepare(
    'SELECT * FROM users WHERE email=?'
  ).get(email);

  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return fail(res, 401, 'Email or password is incorrect.');
  }

  const publicUser = {
    id: user.id,
    email: user.email,
    fullName: user.full_name,
    role: user.role
  };

  const token = jwt.sign(publicUser, JWT_SECRET, { expiresIn: '8h' });

  res.json({ token, user: publicUser });
}));

app.get('/api/auth/me', auth, (req, res) => {
  res.json({ user: req.user });
});

// Offices
app.get('/api/offices', auth, (req, res) => {
  res.json(
    listQuery(
      'SELECT id, name, city, time_zone AS timeZone FROM offices WHERE is_active=1 ORDER BY name'
    )
  );
});

app.get('/api/offices/:id/spaces', auth, (req, res) => {
  const spaces = listQuery(
    'SELECT id, office_id AS officeId, name, type, capacity FROM spaces WHERE office_id=? AND is_active=1 ORDER BY type, name',
    [Number(req.params.id)]
  );

  res.json(spaces);
});

app.post('/api/offices', auth, admin, (req, res) => {
  const name = cleanText(req.body.name);
  const city = cleanText(req.body.city);
  const timeZone = cleanText(req.body.timeZone, 80);

  if (!name || !city || !timeZone) {
    return fail(res, 400, 'Name, city and IANA time zone are required.');
  }

  try {
    new Intl.DateTimeFormat('en', { timeZone });
  } catch {
    return fail(res, 400, 'Enter a valid IANA time zone.');
  }

  const result = db.prepare(
    'INSERT INTO offices(name, city, time_zone) VALUES(?,?,?)'
  ).run(name, city, timeZone);

  res.status(201).json({
    id: Number(result.lastInsertRowid),
    name,
    city,
    timeZone
  });
});

app.put('/api/offices/:id', auth, admin, (req, res) => {
  const name = cleanText(req.body.name);
  const city = cleanText(req.body.city);
  const timeZone = cleanText(req.body.timeZone, 80);

  if (!name || !city || !timeZone) {
    return fail(res, 400, 'Name, city and IANA time zone are required.');
  }

  try {
    new Intl.DateTimeFormat('en', { timeZone });
  } catch {
    return fail(res, 400, 'Enter a valid IANA time zone.');
  }

  const result = db.prepare(
    'UPDATE offices SET name=?, city=?, time_zone=? WHERE id=?'
  ).run(name, city, timeZone, Number(req.params.id));

  if (!result.changes) {
    return fail(res, 404, 'Office not found.');
  }

  res.json({ message: 'Office updated.' });
});

app.delete('/api/offices/:id', auth, admin, (req, res) => {
  const id = Number(req.params.id);

  db.prepare('UPDATE offices SET is_active=0 WHERE id=?').run(id);
  db.prepare('UPDATE spaces SET is_active=0 WHERE office_id=?').run(id);

  res.json({ message: 'Office archived. Booking history is preserved.' });
});

// Spaces
app.get('/api/spaces', auth, (req, res) => {
  const rows = listQuery(`
    SELECT
      s.id,
      s.office_id AS officeId,
      o.name AS officeName,
      s.name,
      s.type,
      s.capacity,
      s.is_active AS isActive
    FROM spaces s
    JOIN offices o ON o.id=s.office_id
    ORDER BY o.name, s.type, s.name
  `);

  res.json(rows);
});

app.post('/api/spaces', auth, admin, (req, res) => {
  const officeId = Number(req.body.officeId);
  const name = cleanText(req.body.name);
  const type = req.body.type;
  const capacity = Number(req.body.capacity || 1);

  if (
    !officeId ||
    !name ||
    !['Desk', 'Room'].includes(type) ||
    !Number.isInteger(capacity) ||
    capacity < 1 ||
    (type === 'Desk' && capacity !== 1)
  ) {
    return fail(
      res,
      400,
      'Provide a valid office, name, type and capacity. Desks have capacity 1.'
    );
  }

  const office = db.prepare(
    'SELECT id FROM offices WHERE id=? AND is_active=1'
  ).get(officeId);

  if (!office) {
    return fail(res, 404, 'Active office not found.');
  }

  const result = db.prepare(
    'INSERT INTO spaces(office_id, name, type, capacity) VALUES(?,?,?,?)'
  ).run(officeId, name, type, capacity);

  res.status(201).json({
    id: Number(result.lastInsertRowid),
    officeId,
    name,
    type,
    capacity,
    isActive: 1
  });
});

app.put('/api/spaces/:id', auth, admin, (req, res) => {
  const officeId = Number(req.body.officeId);
  const name = cleanText(req.body.name);
  const type = req.body.type;
  const capacity = Number(req.body.capacity || 1);
  const isActive = req.body.isActive ? 1 : 0;

  if (
    !officeId ||
    !name ||
    !['Desk', 'Room'].includes(type) ||
    !Number.isInteger(capacity) ||
    capacity < 1 ||
    (type === 'Desk' && capacity !== 1)
  ) {
    return fail(res, 400, 'Provide valid space details. Desks have capacity 1.');
  }

  const result = db.prepare(
    'UPDATE spaces SET office_id=?, name=?, type=?, capacity=?, is_active=? WHERE id=?'
  ).run(
    officeId,
    name,
    type,
    capacity,
    isActive,
    Number(req.params.id)
  );

  if (!result.changes) {
    return fail(res, 404, 'Space not found.');
  }

  res.json({ message: 'Space updated.' });
});

app.delete('/api/spaces/:id', auth, admin, (req, res) => {
  const result = db.prepare(
    'UPDATE spaces SET is_active=0 WHERE id=?'
  ).run(Number(req.params.id));

  if (!result.changes) {
    return fail(res, 404, 'Space not found.');
  }

  res.json({ message: 'Space deactivated. History is preserved.' });
});

// Search for available desks and rooms
app.get('/api/availability', auth, (req, res) => {
  const { officeId, date, from, to, type } = req.query;

  if (!officeId || !date || !from || !to) {
    return fail(res, 400, 'officeId, date, from and to are required.');
  }

  const office = db.prepare(
    'SELECT * FROM offices WHERE id=? AND is_active=1'
  ).get(Number(officeId));

  if (!office) {
    return fail(res, 404, 'Office not found.');
  }

  const errors = validateSlot({
    date,
    from,
    to,
    officeTimeZone: office.time_zone
  });

  if (errors.length) {
    return fail(res, 400, 'Please correct the search time.', errors);
  }

  const startUtc = toUtcIso(date, from, office.time_zone);
  const endUtc = toUtcIso(date, to, office.time_zone);

  const params = [Number(officeId)];
  let typeClause = '';

  if (['Desk', 'Room'].includes(type)) {
    typeClause = ' AND s.type=?';
    params.push(type);
  }

  params.push(endUtc, startUtc);

  const rows = listQuery(
    `SELECT
       s.id,
       s.office_id AS officeId,
       s.name,
       s.type,
       s.capacity,
       o.name AS officeName,
       o.time_zone AS timeZone
     FROM spaces s
     JOIN offices o ON o.id=s.office_id
     WHERE s.office_id=?
       AND s.is_active=1
       AND o.is_active=1
       ${typeClause}
       AND NOT EXISTS (
         SELECT 1
         FROM bookings b
         WHERE b.space_id=s.id
           AND b.status='Active'
           AND b.start_utc < ?
           AND b.end_utc > ?
       )
     ORDER BY s.type, s.name`,
    params
  );

  res.json(rows);
});

// Create a booking. The transaction prevents overlapping bookings.
app.post('/api/bookings', auth, (req, res) => {
  const spaceId = Number(req.body.spaceId);
  const date = String(req.body.date || '');
  const from = String(req.body.from || '');
  const to = String(req.body.to || '');
  const attendees = Number(req.body.attendees || 1);

  const tx = db.transaction(() => {
    const space = db.prepare(`
      SELECT s.*, o.time_zone, o.is_active AS office_active
      FROM spaces s
      JOIN offices o ON o.id=s.office_id
      WHERE s.id=?
    `).get(spaceId);

    if (!space || !space.is_active || !space.office_active) {
      return {
        status: 404,
        body: { error: 'This space is not available for booking.' }
      };
    }

    const errors = validateSlot({
      date,
      from,
      to,
      officeTimeZone: space.time_zone
    });

    if (errors.length) {
      return {
        status: 400,
        body: {
          error: 'Booking details are invalid.',
          details: errors
        }
      };
    }

    if (
      !Number.isInteger(attendees) ||
      attendees < 1 ||
      attendees > space.capacity
    ) {
      return {
        status: 400,
        body: {
          error: `Attendees must be between 1 and this space's capacity (${space.capacity}).`
        }
      };
    }

    if (space.type === 'Desk' && attendees !== 1) {
      return {
        status: 400,
        body: { error: 'A desk booking is for one person.' }
      };
    }

    const startUtc = toUtcIso(date, from, space.time_zone);
    const endUtc = toUtcIso(date, to, space.time_zone);

    const conflict = db.prepare(`
      SELECT id
      FROM bookings
      WHERE space_id=?
        AND status='Active'
        AND start_utc < ?
        AND end_utc > ?
      LIMIT 1
    `).get(spaceId, endUtc, startUtc);

    if (conflict) {
      return {
        status: 409,
        body: {
          error: 'This space was just booked for an overlapping time. Please choose another space or time.'
        }
      };
    }

    if (space.type === 'Desk') {
      const count = db.prepare(`
        SELECT COUNT(*) AS n
        FROM bookings b
        JOIN spaces s ON s.id=b.space_id
        WHERE b.user_id=?
          AND b.local_date=?
          AND b.status='Active'
          AND s.type='Desk'
      `).get(req.user.id, date).n;

      if (count >= MAX_DAILY_DESK_BOOKINGS) {
        return {
          status: 400,
          body: {
            error: 'You can hold at most 2 active desk bookings per day.'
          }
        };
      }
    }

    const result = db.prepare(`
      INSERT INTO bookings(
        space_id,
        user_id,
        start_utc,
        end_utc,
        local_date,
        start_local,
        end_local,
        attendees,
        status
      )
      VALUES(?,?,?,?,?,?,?,?,'Active')
    `).run(
      spaceId,
      req.user.id,
      startUtc,
      endUtc,
      date,
      from,
      to,
      attendees
    );

    return {
      status: 201,
      body: {
        id: Number(result.lastInsertRowid),
        message: 'Booking confirmed.',
        startUtc,
        endUtc
      }
    };
  });

  try {
    const result = tx();
    return res.status(result.status).json(result.body);
  } catch (error) {
    console.error('Booking creation failed:', error.message);
    return fail(res, 500, 'Unable to create booking. Please try again.');
  }
});

// Current employee's bookings
app.get('/api/bookings/me', auth, (req, res) => {
  const rows = listQuery(`
    SELECT
      b.id,
      b.space_id AS spaceId,
      b.user_id AS userId,
      b.start_utc AS startUtc,
      b.end_utc AS endUtc,
      b.local_date AS date,
      b.start_local AS startTime,
      b.end_local AS endTime,
      b.attendees,
      b.status,
      b.cancel_reason AS cancelReason,
      s.name AS spaceName,
      s.type,
      s.capacity,
      o.name AS officeName,
      o.city,
      o.time_zone AS timeZone
    FROM bookings b
    JOIN spaces s ON s.id=b.space_id
    JOIN offices o ON o.id=s.office_id
    WHERE b.user_id=?
    ORDER BY b.start_utc DESC
  `, [req.user.id]);

  res.json(rows);
});

// Cancel a booking
app.delete('/api/bookings/:id', auth, (req, res) => {
  const id = Number(req.params.id);

  const booking = db.prepare(`
    SELECT b.*, s.office_id, o.time_zone
    FROM bookings b
    JOIN spaces s ON s.id=b.space_id
    JOIN offices o ON o.id=s.office_id
    WHERE b.id=?
  `).get(id);

  if (!booking) {
    return fail(res, 404, 'Booking not found.');
  }

  if (req.user.role !== 'Admin' && booking.user_id !== req.user.id) {
    return fail(res, 403, 'You cannot cancel another employee’s booking.');
  }

  if (booking.status !== 'Active') {
    return fail(res, 400, 'This booking is already cancelled.');
  }

  if (new Date(booking.start_utc) <= new Date()) {
    return fail(res, 400, 'Past or in-progress bookings cannot be cancelled.');
  }

  const reason = req.user.role === 'Admin'
    ? cleanText(req.body?.reason, 300)
    : 'Cancelled by employee';

  if (req.user.role === 'Admin' && !reason) {
    return fail(res, 400, 'Admins must provide a cancellation reason.');
  }

  db.prepare(
    "UPDATE bookings SET status='Cancelled', cancel_reason=? WHERE id=?"
  ).run(reason, id);

  res.json({ message: 'Booking cancelled.', reason });
});

// Admin occupancy report
app.get('/api/admin/occupancy', auth, admin, (req, res) => {
  const officeId = Number(req.query.officeId);
  const date = String(req.query.date || '');

  if (!officeId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return fail(res, 400, 'officeId and date are required.');
  }

  const office = db.prepare(
    'SELECT * FROM offices WHERE id=? AND is_active=1'
  ).get(officeId);

  if (!office) {
    return fail(res, 404, 'Office not found.');
  }

  const rows = listQuery(`
    SELECT
      s.id AS spaceId,
      s.name AS spaceName,
      s.type,
      s.capacity,
      b.id AS bookingId,
      b.start_local AS startTime,
      b.end_local AS endTime,
      b.attendees,
      b.status,
      b.cancel_reason AS cancelReason,
      u.full_name AS employeeName,
      u.email
    FROM spaces s
    LEFT JOIN bookings b
      ON b.space_id=s.id
      AND b.local_date=?
    LEFT JOIN users u ON u.id=b.user_id
    WHERE s.office_id=?
      AND s.is_active=1
    ORDER BY s.type, s.name, b.start_utc
  `, [date, officeId]);

  res.json({
    office: {
      id: office.id,
      name: office.name,
      city: office.city,
      timeZone: office.time_zone
    },
    date,
    spaces: rows
  });
});

// Admin statistics
app.get('/api/admin/stats', auth, admin, (req, res) => {
  const rows = listQuery(`
    SELECT
      o.id,
      o.name,
      o.city,
      COUNT(DISTINCT s.id) AS spaces,
      COUNT(b.id) AS bookings,
      ROUND(
        100.0 * COUNT(
          CASE WHEN b.status='Active' THEN 1 END
        ) / MAX(1, COUNT(DISTINCT s.id) * 14),
        1
      ) AS occupancyPercent
    FROM offices o
    LEFT JOIN spaces s
      ON s.office_id=o.id
      AND s.is_active=1
    LEFT JOIN bookings b
      ON b.space_id=s.id
      AND b.local_date >= date('now','-7 day')
      AND b.local_date <= date('now')
    GROUP BY o.id
    ORDER BY o.name
  `);

  res.json(rows);
});

// Unknown API endpoint
app.use('/api', (req, res) => {
  fail(res, 404, 'API endpoint not found.');
});

// Central error handler
app.use((err, req, res, next) => {
  console.error(JSON.stringify({
    level: 'error',
    message: err.message,
    path: req.path
  }));

  if (res.headersSent) {
    return next(err);
  }

  return fail(res, 500, 'An unexpected server error occurred.');
});

// Start the server when this file is run directly
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(JSON.stringify({
      level: 'info',
      message: `DeskSpot running on port ${PORT}`,
      port: PORT
    }));
  });
}

module.exports = { app, db };
