-- CreateTable
CREATE TABLE "professor_unavailabilities" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "professor_id" UUID NOT NULL,
    "day_of_week" SMALLINT NOT NULL,
    "start_minute" SMALLINT NOT NULL,
    "end_minute" SMALLINT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "professor_unavailabilities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "professor_unavailabilities_school_id_idx" ON "professor_unavailabilities"("school_id");

-- CreateIndex
CREATE INDEX "professor_unavailabilities_professor_id_idx" ON "professor_unavailabilities"("professor_id");

-- AddForeignKey
ALTER TABLE "professor_unavailabilities" ADD CONSTRAINT "professor_unavailabilities_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "professor_unavailabilities" ADD CONSTRAINT "professor_unavailabilities_professor_id_fkey" FOREIGN KEY ("professor_id") REFERENCES "professors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Restricciones escritas a mano (Prisma no genera CHECK): el día es de lunes (1) a viernes (5) y el tramo
-- `[start_minute, end_minute)` cabe en el día (minutos desde las 00:00, de 0 a 1439) y no está vacío.
ALTER TABLE "professor_unavailabilities" ADD CONSTRAINT "professor_unavailabilities_day_of_week_check"
    CHECK ("day_of_week" BETWEEN 1 AND 5);

ALTER TABLE "professor_unavailabilities" ADD CONSTRAINT "professor_unavailabilities_start_minute_check"
    CHECK ("start_minute" >= 0);

ALTER TABLE "professor_unavailabilities" ADD CONSTRAINT "professor_unavailabilities_end_minute_check"
    CHECK ("end_minute" <= 1439);

ALTER TABLE "professor_unavailabilities" ADD CONSTRAINT "professor_unavailabilities_range_check"
    CHECK ("start_minute" < "end_minute");
