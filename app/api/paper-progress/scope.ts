/**
 * Progress runs are namespaced per user: a run id only addresses events pushed by
 * (or emitted on behalf of) the same user, so guessing or reusing another user's
 * run id reads and writes nothing of theirs. Server-side producers must emit with
 * `scopedRunId(userId, runId)` as well.
 */
export const scopedRunId = (userId: string, runId: string) => `user:${userId}:${runId}`
