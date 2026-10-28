import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();

export async function getSettings() {
  const s = await prisma.settings.findUnique({ where: { id: 1 } });
  return s || prisma.settings.create({ data: { id: 1 } });
}
