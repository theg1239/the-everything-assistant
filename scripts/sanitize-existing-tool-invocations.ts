#!/usr/bin/env ts-node
/**
 * scripts/sanitize-existing-tool-invocations.ts
 *
 * This script sanitizes existing tool invocations in the database to remove
 * any stored passwords and usernames from queryVTOP tool calls.
 *
 * Usage:
 *   ts-node scripts/sanitize-existing-tool-invocations.ts
 *   ts-node scripts/sanitize-existing-tool-invocations.ts --dry-run  # Preview changes without applying
 */

import { PrismaClient } from '@prisma/client'
import { sanitizeToolInvocations } from '../lib/tools/sanitize-tools'

const prisma = new PrismaClient()

async function sanitizeExistingData() {
  const isDryRun = process.argv.includes('--dry-run')

  console.log(`${isDryRun ? 'DRY RUN:' : ''} Starting sanitization of existing tool invocations...`)

  try {
    const messagesWithTools = await prisma.message.findMany({
      select: {
        id: true,
        tool_invocations: true,
      },
    })

    const messagesWithActualTools = messagesWithTools.filter(
      msg =>
        msg.tool_invocations &&
        Array.isArray(msg.tool_invocations) &&
        msg.tool_invocations.length > 0
    )

    console.log(`Found ${messagesWithActualTools.length} messages with tool invocations`)

    let sanitizedCount = 0
    let needsSanitizationCount = 0

    for (const message of messagesWithActualTools) {
      if (!message.tool_invocations || !Array.isArray(message.tool_invocations)) {
        continue
      }

      const containsCredentials = message.tool_invocations.some((tool: any) => {
        if (tool.toolName === 'queryVTOP' || tool.function?.name === 'queryVTOP') {
          if (tool.args && (tool.args.password || tool.args.username)) {
            return true
          }
          if (tool.function?.arguments) {
            try {
              const args =
                typeof tool.function.arguments === 'string'
                  ? JSON.parse(tool.function.arguments)
                  : tool.function.arguments
              if (args.password || args.username) {
                return true
              }
            } catch (e) {
            }
          }
          if (tool.result?.args && (tool.result.args.password || tool.result.args.username)) {
            return true
          }
        }
        return false
      })

      if (containsCredentials) {
        needsSanitizationCount++

        if (isDryRun) {
          console.log(`Would sanitize message ${message.id}`)
        } else {
          const sanitizedToolInvocations = sanitizeToolInvocations(message.tool_invocations)

          await prisma.message.update({
            where: { id: message.id },
            data: {
              tool_invocations: sanitizedToolInvocations,
            },
          })

          sanitizedCount++
          console.log(`Sanitized message ${message.id}`)
        }
      }
    }

    if (isDryRun) {
      console.log(`\nDRY RUN COMPLETE:`)
      console.log(`- ${needsSanitizationCount} messages would be sanitized`)
      console.log(`- Run without --dry-run to apply changes`)
    } else {
      console.log(`\nSANITIZATION COMPLETE:`)
      console.log(`- ${sanitizedCount} messages sanitized`)
      console.log(
        `- ${messagesWithActualTools.length - needsSanitizationCount} messages were already clean`
      )
    }
  } catch (error) {
    console.error('Error during sanitization:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

sanitizeExistingData().catch(error => {
  console.error('Failed to run sanitization script:', error)
  process.exit(1)
})
