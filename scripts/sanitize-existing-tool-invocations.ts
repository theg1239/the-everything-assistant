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

import { prisma } from '../lib/prisma'
import { isRecord } from '../lib/json'
import { isQueryVtopInvocation, sanitizeToolInvocations } from '../lib/sanitize-tools'

const hasCredentials = (args: unknown): boolean =>
  isRecord(args) && Boolean(args.password || args.username)

// Check if this tool invocation is a queryVTOP call that still carries credentials
function containsVtopCredentials(tool: unknown): boolean {
  if (!isRecord(tool) || !isQueryVtopInvocation(tool)) return false
  // Check args
  if (hasCredentials(tool.args)) return true
  // Check function.arguments
  const fnArgs = isRecord(tool.function) ? tool.function.arguments : undefined
  if (fnArgs) {
    try {
      const args: unknown = typeof fnArgs === 'string' ? JSON.parse(fnArgs) : fnArgs
      if (hasCredentials(args)) return true
    } catch {
      // Ignore parsing errors
    }
  }
  // Check result.args
  return isRecord(tool.result) && hasCredentials(tool.result.args)
}

async function sanitizeExistingData() {
  const isDryRun = process.argv.includes('--dry-run')

  console.log(`${isDryRun ? 'DRY RUN:' : ''} Starting sanitization of existing tool invocations...`)

  try {
    // Get all messages with tool invocations
    const messagesWithTools = await prisma.message.findMany({
      select: {
        id: true,
        tool_invocations: true,
      },
    })

    // Filter messages that have tool invocations
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

      // Check if this message contains queryVTOP calls with credentials
      const containsCredentials = message.tool_invocations.some(containsVtopCredentials)

      if (containsCredentials) {
        needsSanitizationCount++

        if (isDryRun) {
          console.log(`Would sanitize message ${message.id}`)
        } else {
          // Sanitize the tool invocations
          const sanitizedToolInvocations = sanitizeToolInvocations(message.tool_invocations)

          // Update the message
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

// Run the script
sanitizeExistingData().catch(error => {
  console.error('Failed to run sanitization script:', error)
  process.exit(1)
})
