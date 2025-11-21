import { prisma } from '@/lib/prisma'

export async function getOrCreateUserForPhone(phoneNumber: string, userName?: string) {
  const email = `whatsapp-${phoneNumber}@whatsapp-bot.local`

  let user = await prisma.user.findUnique({ where: { email } })
  if (user) return user

  user = await prisma.user.create({
    data: {
      email,
      name: userName || `WhatsApp User ${phoneNumber.slice(-4)}`,
      preferences: {
        whatsapp: {
          phoneNumber,
          isWhatsappUser: true,
          joinedAt: new Date().toISOString(),
        },
      },
    },
  })

  return user
}
