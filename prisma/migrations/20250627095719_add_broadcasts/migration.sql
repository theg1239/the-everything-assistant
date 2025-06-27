-- CreateTable
CREATE TABLE "broadcasts" (
    "id" TEXT NOT NULL,
    "slides" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "broadcasts_pkey" PRIMARY KEY ("id")
);
