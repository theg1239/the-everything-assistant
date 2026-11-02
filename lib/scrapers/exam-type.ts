/** Exam-type filter values accepted by the past-paper tools. */
export const EXAM_TYPES = ['cat1', 'cat2', 'fat', 'quiz'] as const
export type ExamType = (typeof EXAM_TYPES)[number]

const compact = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '')

/**
 * Whether a scraped paper label (title / metadata / exam type, as the archives format them:
 * "CAT-1", "cat 1", "CAT1") carries the requested exam type. Compares alphanumerics only.
 */
export const labelHasExamType = (label: string | undefined, examType: string): boolean =>
  Boolean(label) && compact(label ?? '').includes(compact(examType))
