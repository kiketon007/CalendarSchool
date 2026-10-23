-- CreateEnum
CREATE TYPE "CalendarPeriodKind" AS ENUM ('SESSION', 'BREAK');

-- AlterTable
ALTER TABLE "courses" ADD COLUMN     "calendar_id" UUID;

-- CreateTable
CREATE TABLE "calendars" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "normalized_name" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "calendars_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calendar_periods" (
    "id" UUID NOT NULL,
    "calendar_id" UUID NOT NULL,
    "position" SMALLINT NOT NULL,
    "kind" "CalendarPeriodKind" NOT NULL,
    "start_minute" SMALLINT NOT NULL,
    "end_minute" SMALLINT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "calendar_periods_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "calendars_school_id_normalized_name_key" ON "calendars"("school_id", "normalized_name");

-- CreateIndex
CREATE UNIQUE INDEX "calendar_periods_calendar_id_position_key" ON "calendar_periods"("calendar_id", "position");

-- CreateIndex
CREATE INDEX "courses_calendar_id_idx" ON "courses"("calendar_id");

-- AddForeignKey
ALTER TABLE "courses" ADD CONSTRAINT "courses_calendar_id_fkey" FOREIGN KEY ("calendar_id") REFERENCES "calendars"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendars" ADD CONSTRAINT "calendars_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_periods" ADD CONSTRAINT "calendar_periods_calendar_id_fkey" FOREIGN KEY ("calendar_id") REFERENCES "calendars"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Restricción escrita a mano (Prisma no genera CHECK): un periodo ocupa minutos del mismo día y acaba después
-- de empezar. El solapamiento, los máximos de sesiones y recreos y la posición del recreo se validan en la aplicación.
ALTER TABLE "calendar_periods" ADD CONSTRAINT "calendar_periods_minutes_check"
    CHECK ("start_minute" >= 0 AND "end_minute" <= 1439 AND "end_minute" > "start_minute");
