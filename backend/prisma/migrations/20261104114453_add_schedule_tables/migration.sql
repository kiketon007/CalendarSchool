-- CreateEnum
CREATE TYPE "ScheduleStatus" AS ENUM ('DRAFT', 'OFFICIAL');

-- CreateEnum
CREATE TYPE "ScheduleEngine" AS ENUM ('BACKTRACKING');

-- CreateEnum
CREATE TYPE "GenerationStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "GenerationErrorCode" AS ENUM ('NOT_READY', 'INFEASIBLE', 'TIMEOUT', 'INTERNAL');

-- CreateTable
CREATE TABLE "schedules" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "status" "ScheduleStatus" NOT NULL,
    "engine" "ScheduleEngine" NOT NULL,
    "placed_sessions" INTEGER NOT NULL,
    "generated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_id" UUID NOT NULL,

    CONSTRAINT "schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schedule_entries" (
    "id" UUID NOT NULL,
    "schedule_id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "professor_id" UUID,
    "day_of_week" SMALLINT NOT NULL,
    "session_number" SMALLINT NOT NULL,
    "start_minute" SMALLINT NOT NULL,
    "end_minute" SMALLINT NOT NULL,

    CONSTRAINT "schedule_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schedule_generations" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "created_by_id" UUID NOT NULL,
    "status" "GenerationStatus" NOT NULL DEFAULT 'QUEUED',
    "placed" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL DEFAULT 0,
    "error_code" "GenerationErrorCode",
    "error_message" VARCHAR(500),
    "error_details" JSONB,
    "schedule_id" UUID,
    "heartbeat_at" TIMESTAMPTZ,
    "cancel_requested" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMPTZ,
    "finished_at" TIMESTAMPTZ,

    CONSTRAINT "schedule_generations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "schedules_school_id_idx" ON "schedules"("school_id");

-- CreateIndex
CREATE INDEX "schedule_entries_class_id_idx" ON "schedule_entries"("class_id");

-- CreateIndex
CREATE INDEX "schedule_entries_subject_id_idx" ON "schedule_entries"("subject_id");

-- CreateIndex
CREATE INDEX "schedule_entries_professor_id_idx" ON "schedule_entries"("professor_id");

-- CreateIndex
CREATE UNIQUE INDEX "schedule_entries_cell_key" ON "schedule_entries"("schedule_id", "class_id", "day_of_week", "session_number");

-- CreateIndex
CREATE INDEX "schedule_generations_school_id_created_at_idx" ON "schedule_generations"("school_id", "created_at");

-- CreateIndex
CREATE INDEX "schedule_generations_schedule_id_idx" ON "schedule_generations"("schedule_id");

-- AddForeignKey
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_entries" ADD CONSTRAINT "schedule_entries_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_entries" ADD CONSTRAINT "schedule_entries_class_id_course_id_fkey" FOREIGN KEY ("class_id", "course_id") REFERENCES "classes"("id", "course_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_entries" ADD CONSTRAINT "schedule_entries_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_entries" ADD CONSTRAINT "schedule_entries_professor_id_fkey" FOREIGN KEY ("professor_id") REFERENCES "professors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_generations" ADD CONSTRAINT "schedule_generations_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_generations" ADD CONSTRAINT "schedule_generations_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_generations" ADD CONSTRAINT "schedule_generations_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "schedules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Escrito a mano (Prisma no expresa los índices parciales ni los CHECK; revisa el SQL de cada `prisma migrate dev`
-- posterior).

-- Un solo borrador por colegio: una generación nueva sustituye al anterior. Los OFFICIAL no cuentan.
CREATE UNIQUE INDEX "schedules_draft_key" ON "schedules"("school_id") WHERE "status" = 'DRAFT';

-- Una sola generación en curso por colegio: es la exclusión mutua de `POST /api/schedule/generate`.
CREATE UNIQUE INDEX "schedule_generations_in_progress_key" ON "schedule_generations"("school_id") WHERE "status" IN ('QUEUED', 'RUNNING');

ALTER TABLE "schedules" ADD CONSTRAINT "schedules_placed_sessions_check" CHECK ("placed_sessions" >= 0);

ALTER TABLE "schedule_entries" ADD CONSTRAINT "schedule_entries_day_of_week_check" CHECK ("day_of_week" BETWEEN 1 AND 5);
ALTER TABLE "schedule_entries" ADD CONSTRAINT "schedule_entries_session_number_check" CHECK ("session_number" BETWEEN 1 AND 8);
ALTER TABLE "schedule_entries" ADD CONSTRAINT "schedule_entries_start_minute_check" CHECK ("start_minute" >= 0);
ALTER TABLE "schedule_entries" ADD CONSTRAINT "schedule_entries_end_minute_check" CHECK ("end_minute" <= 1440);
ALTER TABLE "schedule_entries" ADD CONSTRAINT "schedule_entries_range_check" CHECK ("start_minute" < "end_minute");

ALTER TABLE "schedule_generations" ADD CONSTRAINT "schedule_generations_progress_check" CHECK ("placed" >= 0 AND "total" >= 0);
