'use server'

import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logSecurityEvent } from '@/lib/mfa'
import { clearCurrentSessionVerification, hasFreshMfa } from '@/lib/session'
import { MFA_STEP_UP_REQUIRED, type DeleteAccountResult } from '@/types/api/mfa'

/**
 * Deletes the signed-in user's account. Users with MFA must have verified within the last
 * 10 minutes; otherwise nothing is deleted and `{ ok: false, error: 'MFA_STEP_UP_REQUIRED' }`
 * is returned (re-verify, then call again).
 */
export async function deleteAccountAction(): Promise<DeleteAccountResult> {
  const session = await auth()
  if (!session?.user?.id) {
    throw new Error('unauthorized')
  }

  const userId = session.user.id
  const mfaEnabled = session.user.mfaRequired === true
  if (!(await hasFreshMfa({ userId, mfaEnabled }))) {
    return { ok: false, error: MFA_STEP_UP_REQUIRED }
  }

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

  await clearCurrentSessionVerification()
  await logSecurityEvent(userId, 'ACCOUNT_DELETED', { by: 'user' })
  return { ok: true }
}
