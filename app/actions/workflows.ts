// 'use server'

// import { start } from 'workflow/api'
// import { getServerSession } from 'next-auth'
// import { authOptions } from '@/lib/auth'
// import {
//   dailyBriefingWorkflow,
//   type DailyBriefingWorkflowInput,
// } from '@/app/workflows/daily-briefing/workflow'

// function assertAdmin(sessionEmail?: string | null) {
//   const adminEmail = process.env.RATE_LIMIT_ADMIN_EMAIL
//   if (!adminEmail) {
//     throw new Error('RATE_LIMIT_ADMIN_EMAIL not configured')
//   }
//   if (!sessionEmail || sessionEmail !== adminEmail) {
//     throw new Error('Unauthorized')
//   }
// }

// export async function triggerDailyBriefingWorkflowAction(input: DailyBriefingWorkflowInput = {}) {
//   const session = await getServerSession(authOptions)
//   assertAdmin(session?.user?.email)

//   const payload: DailyBriefingWorkflowInput = {
//     userIds: Array.isArray(input.userIds) ? input.userIds : undefined,
//     referenceTime: typeof input.referenceTime === 'string' ? input.referenceTime : undefined,
//     dryRun: Boolean(input.dryRun),
//   }

//   const run = await start(dailyBriefingWorkflow, [payload])

//   return {
//     runId: run.runId,
//     input: payload,
//   }
// }
