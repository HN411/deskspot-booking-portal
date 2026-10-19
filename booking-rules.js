'use strict';

const SLOT_MINUTES = 30;
const OFFICE_OPEN_MINUTES = 8 * 60;
const OFFICE_CLOSE_MINUTES = 20 * 60;
const MAX_DAYS_AHEAD = 14;
const MAX_DAILY_DESK_BOOKINGS = 2;

function parseLocalTime(value) {
  if (typeof value !== 'string' || !/^([01]\d|2[0-3]):([0-5]\d)$/.test(value)) return null;
  const [, hours, minutes] = value.match(/^(\d{2}):(\d{2})$/);
  return Number(hours) * 60 + Number(minutes);
}

function validateSlot({ date, from, to, now = new Date(), officeTimeZone = 'Asia/Karachi' }) {
  const errors = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) errors.push('Choose a valid booking date.');
  const startMin = parseLocalTime(from);
  const endMin = parseLocalTime(to);
  if (startMin === null || endMin === null) errors.push('Enter a valid start and end time.');
  if (startMin !== null && endMin !== null) {
    if (startMin >= endMin) errors.push('End time must be after start time.');
    if (startMin % SLOT_MINUTES !== 0 || endMin % SLOT_MINUTES !== 0) errors.push('Bookings must align to 30-minute slots.');
    if (startMin < OFFICE_OPEN_MINUTES || endMin > OFFICE_CLOSE_MINUTES) errors.push('Bookings must be within office hours (08:00–20:00).');
  }
  if (errors.length) return errors;
  const [year, month, day] = date.split('-').map(Number);
  const dateObj = new Date(Date.UTC(year, month - 1, day));
  if (dateObj.getUTCFullYear() !== year || dateObj.getUTCMonth() !== month - 1 || dateObj.getUTCDate() !== day) errors.push('Choose a real calendar date.');
  if (errors.length) return errors;
  const todayLocal = new Intl.DateTimeFormat('en-CA', { timeZone: officeTimeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const todayDate = new Date(`${todayLocal}T00:00:00Z`);
  const selectedDate = new Date(`${date}T00:00:00Z`);
  const daysAhead = Math.round((selectedDate - todayDate) / 86400000);
  if (daysAhead < 0) errors.push('Bookings must be in the future.');
  if (daysAhead > MAX_DAYS_AHEAD) errors.push('Bookings can be made at most 14 days ahead.');
  if (daysAhead === 0) {
    const currentLocal = new Intl.DateTimeFormat('en-GB', { timeZone: officeTimeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now);
    const currentMin = parseLocalTime(currentLocal);
    if (startMin <= currentMin) errors.push('Choose a start time that has not passed in the office local time.');
  }
  return errors;
}

function overlaps(startA, endA, startB, endB) {
  return new Date(startA).getTime() < new Date(endB).getTime() && new Date(endA).getTime() > new Date(startB).getTime();
}

function toUtcIso(date, time, timeZone) {
  // Iterative offset correction handles standard and daylight-saving offsets using IANA time zones.
  const target = `${date}T${time}:00`;
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  const desiredUtc = Date.UTC(y, mo - 1, d, h, mi, 0);
  let guess = desiredUtc;
  for (let i = 0; i < 3; i++) {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(guess));
    const p = Object.fromEntries(parts.map(x => [x.type, x.value]));
    const represented = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second));
    guess += desiredUtc - represented;
  }
  return new Date(guess).toISOString();
}

module.exports = { SLOT_MINUTES, OFFICE_OPEN_MINUTES, OFFICE_CLOSE_MINUTES, MAX_DAYS_AHEAD, MAX_DAILY_DESK_BOOKINGS, parseLocalTime, validateSlot, overlaps, toUtcIso };
