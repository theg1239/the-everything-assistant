import { prisma } from './prisma'
import { Prisma } from '@/prisma/generated/client'
import { toJsonValue } from './json'

export type VTOPSnapshotPayload = {
  command: string
  data: Prisma.JsonValue
  fetchedAt: Date
}

/** Only the columns snapshot consumers read (skips id/userId). */
const snapshotSelect = {
  command: true,
  data: true,
  fetchedAt: true,
} as const satisfies Prisma.VTOPSnapshotSelect

export async function listVTOPSnapshots(
  userId: string,
  commands?: string[]
): Promise<VTOPSnapshotPayload[]> {
  return prisma.vTOPSnapshot.findMany({
    where: {
      userId,
      ...(commands ? { command: { in: commands } } : {}),
    },
    select: snapshotSelect,
    orderBy: { fetchedAt: 'desc' },
  })
}

/** Snapshot payloads are formatter output; normalize to plain JSON before storing. */
const toSnapshotJson = (data: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull => {
  const json = toJsonValue(data)
  return json === null || json === undefined ? Prisma.JsonNull : json
}

export async function upsertVTOPSnapshot(userId: string, command: string, payload: unknown) {
  const data = toSnapshotJson(payload)
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
