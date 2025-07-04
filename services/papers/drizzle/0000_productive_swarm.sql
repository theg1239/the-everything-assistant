CREATE TABLE "papers" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"course_code" text,
	"year" integer,
	"exam_type" text,
	"slot" text,
	"semester" text,
	"file_url" text NOT NULL,
	"thumbnail_url" text NOT NULL,
	"cloudinary_public_id" text NOT NULL,
	"thumbnail_public_id" text NOT NULL,
	"ocr_text" text,
	"extracted_text" text,
	"original_filename" text NOT NULL,
	"file_size" integer NOT NULL,
	"mime_type" text NOT NULL,
	"uploaded_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "course_code_idx" ON "papers" USING btree ("course_code");--> statement-breakpoint
CREATE INDEX "year_idx" ON "papers" USING btree ("year");--> statement-breakpoint
CREATE INDEX "exam_type_idx" ON "papers" USING btree ("exam_type");--> statement-breakpoint
CREATE INDEX "created_at_idx" ON "papers" USING btree ("created_at");