import { PrismaClient } from '@prisma/client'

const g = globalThis as unknown as { prismaSorteo?: PrismaClient }
export const prisma = g.prismaSorteo ?? new PrismaClient()
if (process.env.NODE_ENV !== 'production') g.prismaSorteo = prisma
