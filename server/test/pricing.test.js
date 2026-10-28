import { test } from 'node:test';
import assert from 'node:assert/strict';
import { priceItem, travelFee, totals } from '../src/lib/pricing.js';
import { canTransition } from '../src/lib/bookings.js';

const driveway = {
  id: 's1', name: 'Driveway', category: 'POWER_WASH', unit: 'SQFT', pricePerUnit: 0.2, minimumCharge: 100, baseMinutes: 30, unitsPerHour: 1000,
  materials: [{ id: 'm1', name: 'Pavers', multiplier: 1.5 }],
  addOns: [{ id: 'a1', name: 'Sealing', unit: 'SQFT', price: 0.3, active: true }, { id: 'a2', name: 'Oil', unit: 'FLAT', price: 40, active: true }],
};
const settings = { travelFreeMiles: 10, travelFeePerMile: 2, travelFeeMax: 50, taxRate: 6, depositEnabled: true, depositPercent: 25, slotIntervalMinutes: 60 };

test('per-unit price with material multiplier and add-ons', () => {
  const r = priceItem(driveway, { quantity: 1000, materialId: 'm1', addOnIds: ['a1', 'a2'] });
  assert.equal(r.baseAmount, 300); // 1000 * 0.2 * 1.5
  assert.equal(r.addOns.find((a) => a.id === 'a1').amount, 300);
  assert.equal(r.lineTotal, 640);
  assert.equal(r.minimumApplied, false);
});

test('minimum charge applies to small jobs', () => {
  const r = priceItem(driveway, { quantity: 100 });
  assert.equal(r.baseAmount, 100);
  assert.equal(r.minimumApplied, true);
});

test('travel fee starts after free radius and is capped', () => {
  assert.equal(travelFee(settings, 5), 0);
  assert.equal(travelFee(settings, 15), 10);
  assert.equal(travelFee(settings, 100), 50);
});

test('totals include tax, deposit and duration rounded to slot size', () => {
  const item = priceItem(driveway, { quantity: 1000 });
  const t = totals(settings, [item], 15);
  assert.equal(t.subtotal, 200);
  assert.equal(t.travelFee, 10);
  assert.equal(t.tax, 12.6);
  assert.equal(t.total, 222.6);
  assert.equal(t.deposit, 55.65);
  assert.equal(t.durationMinutes, 120); // 30 + 60 = 90 → 120
});

test('pros can only move jobs forward through field statuses', () => {
  assert.equal(canTransition('SCHEDULED', 'ON_THE_WAY', 'PRO'), true);
  assert.equal(canTransition('ON_THE_WAY', 'IN_PROGRESS', 'PRO'), true);
  assert.equal(canTransition('IN_PROGRESS', 'COMPLETED', 'PRO'), true);
  assert.equal(canTransition('REQUESTED', 'COMPLETED', 'PRO'), false);
  assert.equal(canTransition('SCHEDULED', 'CANCELLED', 'PRO'), false);
  assert.equal(canTransition('REQUESTED', 'COMPLETED', 'ADMIN'), true);
});
