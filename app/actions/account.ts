'use server'

import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logSecurityEvent } from '@/lib/mfa'

export async function deleteAccountAction() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    throw new Error('unauthorized')
  }

  const userId = session.user.id

  await prisma.$transaction(async tx => {
    await tx.webAuthnCredential.deleteMany({ where: { userId } })
    await tx.tokenUsage.deleteMany({ where: { userId } })
    await tx.securityLog.deleteMany({ where: { userId } })
    await tx.whatsAppConversation.deleteMany({ where: { userId } })
    await tx.memory.deleteMany({ where: { userId } })
    await tx.memorySettings.deleteMany({ where: { userId } })
    await tx.chat.deleteMany({ where: { userId } })
    await tx.session.deleteMany({ where: { userId } })
    await tx.account.deleteMany({ where: { userId } })
    await tx.vTOPSnapshot.deleteMany({ where: { userId } })
    await tx.user.delete({ where: { id: userId } })
  })

  await logSecurityEvent(userId, 'ACCOUNT_DELETED', { by: 'user' })
  return { ok: true }
}
