import { prisma } from './prisma'
import type { VTOPSnapshot } from '@prisma/client'

export type VTOPSnapshotPayload = {
  command: string
  data: any
  fetchedAt: Date
}

export async function listVTOPSnapshots(
  userId: string,
  commands?: string[]
): Promise<VTOPSnapshot[]> {
  return prisma.vTOPSnapshot.findMany({
    where: {
      userId,
      ...(commands ? { command: { in: commands } } : {}),
    },
    orderBy: { fetchedAt: 'desc' },
  })
}

export async function upsertVTOPSnapshot(userId: string, command: string, data: any) {
  return prisma.vTOPSnapshot.upsert({
    where: { userId_command: { userId, command } },
    update: {
      data,
      fetchedAt: new Date(),
    },
    create: {
      userId,
      command,
      data,
    },
  })
}
