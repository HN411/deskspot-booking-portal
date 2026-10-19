'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { validateSlot, overlaps, toUtcIso, parseLocalTime } = require('../booking-rules');
const fixedNow = new Date('2026-10-19T05:00:00.000Z'); // 10:00 in Islamabad

test('accepts valid aligned slot within office hours',()=>{
  assert.deepEqual(validateSlot({date:'2026-10-20',from:'09:00',to:'10:00',now:fixedNow,officeTimeZone:'Asia/Karachi'}),[]);
});
test('rejects non-30-minute-aligned bookings',()=>{
  assert.ok(validateSlot({date:'2026-10-20',from:'10:15',to:'10:45',now:fixedNow,officeTimeZone:'Asia/Karachi'}).some(x=>x.includes('30-minute')));
});
test('rejects bookings outside office hours',()=>{
  assert.ok(validateSlot({date:'2026-10-20',from:'19:30',to:'20:30',now:fixedNow,officeTimeZone:'Europe/Copenhagen'}).some(x=>x.includes('office hours')));
});
test('rejects more than fourteen days ahead',()=>{
  assert.ok(validateSlot({date:'2026-11-03',from:'10:00',to:'11:00',now:fixedNow,officeTimeZone:'Asia/Karachi'}).some(x=>x.includes('14 days')));
});
test('rejects end time at or before start',()=>{
  assert.ok(validateSlot({date:'2026-10-20',from:'10:00',to:'10:00',now:fixedNow,officeTimeZone:'Asia/Karachi'}).some(x=>x.includes('after')));
});
test('overlap logic rejects partial and full overlaps but permits touching edges',()=>{
  assert.equal(overlaps('2026-10-20T04:00:00Z','2026-10-20T05:00:00Z','2026-10-20T04:30:00Z','2026-10-20T05:30:00Z'),true);
  assert.equal(overlaps('2026-10-20T04:00:00Z','2026-10-20T05:00:00Z','2026-10-20T05:00:00Z','2026-10-20T06:00:00Z'),false);
});
test('converts office local time to UTC with IANA timezone',()=>{
  assert.equal(toUtcIso('2026-10-20','10:00','Asia/Karachi'),'2026-10-20T05:00:00.000Z');
  assert.equal(toUtcIso('2026-10-20','10:00','Europe/Copenhagen'),'2026-10-20T08:00:00.000Z');
});
test('time parser validates HH:mm',()=>{assert.equal(parseLocalTime('08:30'),510);assert.equal(parseLocalTime('8:30'),null);});
