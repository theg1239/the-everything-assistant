import { pgTable, text, timestamp, integer, index } from 'drizzle-orm/pg-core'

export const papers = pgTable(
  'papers',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    title: text('title').notNull(),
    courseCode: text('course_code').notNull(),
    year: integer('year').notNull(),
    examType: text('exam_type').notNull(),
    slot: text('slot').notNull(),
    semester: text('semester').notNull(),
    fileUrl: text('file_url').notNull(),
    thumbnailUrl: text('thumbnail_url').notNull(),
    cloudinaryPublicId: text('cloudinary_public_id').notNull(),
    thumbnailPublicId: text('thumbnail_public_id').notNull(),
    ocrText: text('ocr_text'),
    extractedText: text('extracted_text'),
    originalFilename: text('original_filename').notNull(),
    fileSize: integer('file_size').notNull(),
    mimeType: text('mime_type').notNull(),
    uploadedBy: text('uploaded_by'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    courseCodeIdx: index('course_code_idx').on(table.courseCode),
    yearIdx: index('year_idx').on(table.year),
    examTypeIdx: index('exam_type_idx').on(table.examType),
    createdAtIdx: index('created_at_idx').on(table.createdAt),
  })
)

export type Paper = typeof papers.$inferSelect
export type NewPaper = typeof papers.$inferInsert
