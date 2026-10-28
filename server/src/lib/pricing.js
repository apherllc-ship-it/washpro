// Pricing engine. The server always recalculates prices from the database –
// prices sent by the browser are never trusted.
import { prisma, getSettings } from '../db.js';
import { HttpError } from '../middleware/error.js';
import { drivingMiles, geocode } from './geo.js';

export const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

// Pure calculation (no DB) so it can be unit-tested.
export function priceItem(service, { quantity, materialId, addOnIds = [] }) {
  const qty = service.unit === 'FLAT' ? 1 : Math.max(0, Number(quantity) || 0);
  const material = service.materials.find((m) => m.id === materialId) || null;
  const multiplier = material ? material.multiplier : 1;
  const raw = qty * service.pricePerUnit * multiplier;
  const minimumApplied = raw < service.minimumCharge;
  const baseAmount = round2(Math.max(raw, service.minimumCharge));

  const addOns = service.addOns
    .filter((a) => a.active && addOnIds.includes(a.id))
    .map((a) => ({
      id: a.id,
      name: a.name,
      unit: a.unit,
      price: a.price,
      amount: round2(a.unit === 'FLAT' ? a.price : a.price * qty),
    }));

  const lineTotal = round2(baseAmount + addOns.reduce((s, a) => s + a.amount, 0));
  const minutes = service.baseMinutes + (service.unit === 'FLAT' ? 0 : (qty / Math.max(service.unitsPerHour, 1)) * 60);

  return {
    serviceId: service.id,
    serviceName: service.name,
    category: service.category,
    unit: service.unit,
    quantity: round2(qty),
    unitPrice: service.pricePerUnit,
    materialName: material?.name || null,
    multiplier,
    baseAmount,
    minimumApplied,
    minimumCharge: service.minimumCharge,
    addOns,
    lineTotal,
    minutes,
  };
}

export function travelFee(settings, miles) {
  const billable = Math.max(0, miles - settings.travelFreeMiles);
  return round2(Math.min(billable * settings.travelFeePerMile, settings.travelFeeMax));
}

export function totals(settings, items, miles) {
  const subtotal = round2(items.reduce((s, i) => s + i.lineTotal, 0));
  const travel = travelFee(settings, miles);
  const tax = round2(((subtotal + travel) * settings.taxRate) / 100);
  const total = round2(subtotal + travel + tax);
  const deposit = settings.depositEnabled ? round2((total * settings.depositPercent) / 100) : 0;
  const interval = settings.slotIntervalMinutes || 60;
  const rawMinutes = items.reduce((s, i) => s + i.minutes, 0);
  const durationMinutes = Math.max(interval, Math.ceil(rawMinutes / interval) * interval);
  return { subtotal, travelFee: travel, tax, total, deposit, durationMinutes };
}

// Full quote calculation from a request body.
export async function calculateQuote({ address, lat, lng, items }) {
  if (!items?.length) throw new HttpError(400, 'Add at least one area to clean');
  const settings = await getSettings();
  const services = await prisma.service.findMany({
    where: { id: { in: [...new Set(items.map((i) => i.serviceId))] }, active: true },
    include: { materials: true, addOns: true },
  });
  const byId = new Map(services.map((s) => [s.id, s]));

  const priced = items.map((item) => {
    const service = byId.get(item.serviceId);
    if (!service) throw new HttpError(400, 'One of the selected services is no longer available');
    return { ...priceItem(service, item), label: item.label || '', geometry: item.geometry || null };
  });

  let location = lat != null && lng != null ? { lat, lng } : null;
  if (!location && address) location = await geocode(address);

  const business = settings.businessLat != null ? { lat: settings.businessLat, lng: settings.businessLng } : null;
  const miles = business && location ? round2(await drivingMiles(business, location)) : 0;
  const outOfArea = settings.maxServiceMiles > 0 && miles > settings.maxServiceMiles;

  return {
    address,
    lat: location?.lat ?? null,
    lng: location?.lng ?? null,
    distanceMiles: miles,
    outOfArea,
    items: priced,
    ...totals(settings, priced, miles),
  };
}
