// Idempotent seed: safe to run on every deploy.
// - Always ensures settings, business hours and an admin user exist.
// - Seeds sample services/pricing only when there are no services yet.
// - Seeds demo pro/customer accounts only when SEED_DEMO=true.
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const services = [
  // ---- Power washing ----
  {
    name: 'Driveway Cleaning', slug: 'driveway', category: 'POWER_WASH', unit: 'SQFT', surfaceType: 'driveway',
    pricePerUnit: 0.18, minimumCharge: 125, baseMinutes: 30, unitsPerHour: 1200,
    description: 'Surface-cleaner pressure washing for concrete, pavers and asphalt driveways.',
    materials: [['Concrete', 1], ['Pavers', 1.25], ['Asphalt', 0.9], ['Stamped concrete', 1.2]],
    addOns: [['Concrete sealing', 'SQFT', 0.35, 'Penetrating sealer after cleaning'], ['Oil stain treatment', 'FLAT', 45, 'Degreaser on oil spots'], ['Polymeric sand (pavers)', 'SQFT', 0.6, 'Re-sand paver joints']],
  },
  {
    name: 'Patio & Walkway Cleaning', slug: 'patio', category: 'POWER_WASH', unit: 'SQFT', surfaceType: 'patio',
    pricePerUnit: 0.22, minimumCharge: 99, baseMinutes: 20, unitsPerHour: 900,
    description: 'Patios, pool decks, sidewalks and walkways.',
    materials: [['Concrete', 1], ['Pavers', 1.25], ['Natural stone', 1.35], ['Brick', 1.15]],
    addOns: [['Sealing', 'SQFT', 0.4, 'Protective sealer'], ['Polymeric sand (pavers)', 'SQFT', 0.6, 'Re-sand paver joints']],
  },
  {
    name: 'Deck Cleaning', slug: 'deck', category: 'POWER_WASH', unit: 'SQFT', surfaceType: 'deck',
    pricePerUnit: 0.45, minimumCharge: 149, baseMinutes: 30, unitsPerHour: 400,
    description: 'Low-pressure wash and brightening for wood and composite decks.',
    materials: [['Pressure-treated wood', 1], ['Cedar / redwood', 1.2], ['Composite', 0.9]],
    addOns: [['Deck brightener', 'SQFT', 0.15, 'Restores wood color'], ['Stain & seal', 'SQFT', 1.25, 'Semi-transparent stain']],
  },
  {
    name: 'Fence Cleaning', slug: 'fence', category: 'POWER_WASH', unit: 'LINFT', surfaceType: 'fence',
    pricePerUnit: 2.5, minimumCharge: 120, baseMinutes: 20, unitsPerHour: 150,
    description: 'Both sides of wood, vinyl or metal fencing, priced per linear foot (6 ft height).',
    materials: [['Vinyl', 1], ['Wood', 1.2], ['Metal / aluminum', 0.9]],
    addOns: [['Fence staining', 'LINFT', 4, 'Stain both sides']],
  },
  // ---- Soft washing ----
  {
    name: 'House Wash (Siding)', slug: 'house-wash', category: 'SOFT_WASH', unit: 'SQFT', surfaceType: 'siding',
    pricePerUnit: 0.14, minimumCharge: 249, baseMinutes: 45, unitsPerHour: 1500,
    description: 'Low-pressure soft wash that removes mold, mildew and algae from siding.',
    materials: [['Vinyl', 1], ['Brick', 1.1], ['Stucco', 1.25], ['Wood / fiber cement', 1.15]],
    addOns: [['Window rinse', 'FLAT', 49, 'Spot-free rinse of exterior glass'], ['Gutter brightening', 'FLAT', 89, 'Remove black streaks from gutter faces']],
  },
  {
    name: 'Roof Soft Wash', slug: 'roof', category: 'SOFT_WASH', unit: 'SQFT', surfaceType: 'roof',
    pricePerUnit: 0.25, minimumCharge: 399, baseMinutes: 60, unitsPerHour: 900,
    description: 'Removes black streaks (gloeocapsa magma), moss and lichen without damaging shingles.',
    materials: [['Asphalt shingle', 1], ['Metal', 0.9], ['Tile', 1.3], ['Cedar shake', 1.4]],
    addOns: [['Moss treatment', 'SQFT', 0.05, 'Extra treatment on heavy moss'], ['Zinc strip install', 'FLAT', 150, 'Slows future growth']],
  },
  {
    name: 'Gutter Cleaning & Brightening', slug: 'gutters', category: 'SOFT_WASH', unit: 'LINFT', surfaceType: 'gutter',
    pricePerUnit: 1.5, minimumCharge: 129, baseMinutes: 20, unitsPerHour: 120,
    description: 'Debris removal plus exterior face brightening, per linear foot.',
    materials: [['One story', 1], ['Two story', 1.35], ['Three story', 1.7]],
    addOns: [['Downspout flush', 'FLAT', 35, 'Clear clogged downspouts'], ['Gutter guard install', 'LINFT', 6, 'Mesh guards']],
  },
  {
    name: 'Soft Wash Fence / Siding Spot', slug: 'soft-fence', category: 'SOFT_WASH', unit: 'LINFT', surfaceType: 'fence',
    pricePerUnit: 2, minimumCharge: 99, baseMinutes: 20, unitsPerHour: 180,
    description: 'Gentle soft wash for delicate vinyl and painted fences.',
    materials: [['Vinyl', 1], ['Painted wood', 1.15]],
    addOns: [],
  },
];

async function main() {
  await prisma.settings.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      businessName: process.env.BUSINESS_NAME || 'WashPro Exterior Cleaning',
      businessEmail: process.env.BUSINESS_EMAIL || '',
      businessPhone: process.env.BUSINESS_PHONE || '',
      businessAddress: process.env.BUSINESS_ADDRESS || '1600 Pennsylvania Ave NW, Washington, DC 20500',
      businessLat: Number(process.env.BUSINESS_LAT) || 38.8977,
      businessLng: Number(process.env.BUSINESS_LNG) || -77.0365,
    },
  });

  for (let d = 0; d < 7; d++) {
    await prisma.businessHours.upsert({
      where: { dayOfWeek: d },
      update: {},
      create: { dayOfWeek: d, openTime: '08:00', closeTime: d === 6 ? '14:00' : '17:00', closed: d === 0 },
    });
  }

  const adminEmail = (process.env.ADMIN_EMAIL || 'admin@washpro.test').toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD || 'Admin12345';
  const existingAdmin = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (!existingAdmin) {
    await prisma.user.create({
      data: { email: adminEmail, name: 'Business Owner', role: 'ADMIN', passwordHash: await bcrypt.hash(adminPassword, 12) },
    });
    console.log(`Created admin ${adminEmail}`);
  }

  if ((await prisma.service.count()) === 0) {
    for (const [i, s] of services.entries()) {
      const { materials, addOns, ...data } = s;
      await prisma.service.create({
        data: {
          ...data,
          sortOrder: i,
          materials: { create: materials.map(([name, multiplier]) => ({ name, multiplier })) },
          addOns: { create: addOns.map(([name, unit, price, description]) => ({ name, unit, price, description })) },
        },
      });
    }
    console.log(`Seeded ${services.length} services`);
  }

  if (process.env.SEED_DEMO === 'true') {
    const demoPassword = await bcrypt.hash('Password123', 12);
    const demo = [
      { email: 'pro@washpro.test', name: 'Alex Rivera', role: 'PRO', phone: '+15555550101' },
      { email: 'pro2@washpro.test', name: 'Jordan Lee', role: 'PRO', phone: '+15555550102' },
      { email: 'customer@washpro.test', name: 'Sam Customer', role: 'CUSTOMER', phone: '+15555550123' },
    ];
    for (const u of demo) {
      await prisma.user.upsert({ where: { email: u.email }, update: {}, create: { ...u, passwordHash: demoPassword } });
    }
    const customer = await prisma.user.findUnique({ where: { email: 'customer@washpro.test' } });
    if ((await prisma.address.count({ where: { userId: customer.id } })) === 0) {
      await prisma.address.create({
        data: { userId: customer.id, label: 'Home', formatted: '1 Main St, Annapolis, MD 21401', lat: 38.9784, lng: -76.4922, isDefault: true },
      });
    }
    console.log('Demo accounts ready (password: Password123)');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
