#!/usr/bin/env npx tsx

/**
 * Migration script to convert users with "passkey" MFA method to "security_key"
 * This consolidates WebAuthn authentication under a single method name
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function migratePasskeyToSecurityKey() {
  console.log('🔄 Starting passkey to security_key migration...')

  try {
    const users = await prisma.user.findMany({
      where: {
        mfaEnabled: true,
        mfaMethod: 'passkey',
      },
      select: {
        id: true,
        email: true,
        mfaMethod: true,
      },
    })

    console.log(`Found ${users.length} users with passkey method`)

    if (users.length === 0) {
      console.log('No users need migration - all good!')
      return
    }

    const result = await prisma.user.updateMany({
      where: {
        mfaMethod: 'passkey',
      },
      data: {
        mfaMethod: 'security_key',
      },
    })

    console.log(`Migrated ${result.count} users from passkey to security_key`)

    for (const user of users) {
      console.log(`Migrated ${user.email}: passkey → security_key`)
    }

    console.log('\nMigration completed successfully!')
    console.log('All WebAuthn users now use the unified "security_key" method.')
  } catch (error) {
    console.error('Migration failed:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

migratePasskeyToSecurityKey()
  .then(() => {
    console.log('Migration script completed')
    process.exit(0)
  })
  .catch(error => {
    console.error('Migration script failed:', error)
    process.exit(1)
  })
