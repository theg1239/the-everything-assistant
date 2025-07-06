#!/usr/bin/env npx tsx

/**
 * Migration script to convert WebAuthn credential IDs from base64 to base64url format
 * Run this script once to update existing credentials
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function migrateWebAuthnCredentials() {
  console.log('Starting WebAuthn credential migration...')

  try {
    const users = await prisma.user.findMany({
      where: {
        mfaEnabled: true,
        mfaMethod: {
          in: ['security_key', 'passkey'],
        },
        mfaSecret: {
          not: null,
        },
      },
      select: {
        id: true,
        email: true,
        mfaMethod: true,
        mfaSecret: true,
      },
    })

    console.log(`Found ${users.length} users with WebAuthn credentials`)

    let migratedCount = 0
    let skippedCount = 0
    let errorCount = 0

    for (const user of users) {
      try {
        if (!user.mfaSecret) continue

        try {
          Buffer.from(user.mfaSecret, 'base64url')
          console.log(`✅ User ${user.email} already has base64url format, skipping`)
          skippedCount++
          continue
        } catch (e) {}

        try {
          const buffer = Buffer.from(user.mfaSecret, 'base64')
          const base64urlCredentialId = buffer.toString('base64url')

          await prisma.user.update({
            where: { id: user.id },
            data: { mfaSecret: base64urlCredentialId },
          })

          console.log(
            `Migrated ${user.email} (${user.mfaMethod}): ${user.mfaSecret.substring(0, 10)}... → ${base64urlCredentialId.substring(0, 10)}...`
          )
          migratedCount++
        } catch (e2) {
          console.error(`Failed to migrate ${user.email}: Invalid credential format`)
          errorCount++
        }
      } catch (error) {
        console.error(`Error processing user ${user.email}:`, error)
        errorCount++
      }
    }

    console.log('\nMigration Summary:')
    console.log(`Migrated: ${migratedCount}`)
    console.log(`Skipped (already correct): ${skippedCount}`)
    console.log(`Errors: ${errorCount}`)
    console.log(`Total processed: ${users.length}`)

    if (migratedCount > 0) {
      console.log('\n Migration completed successfully!')
      console.log(
        'Users with migrated credentials will now have consistent security key authentication.'
      )
    } else if (skippedCount === users.length) {
      console.log('\n All credentials are already in the correct format!')
    }
  } catch (error) {
    console.error('Migration failed:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

migrateWebAuthnCredentials()
  .then(() => {
    console.log('Migration script completed')
    process.exit(0)
  })
  .catch(error => {
    console.error('Migration script failed:', error)
    process.exit(1)
  })
