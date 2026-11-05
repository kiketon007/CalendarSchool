-- AlterTable
ALTER TABLE "schedules" ADD COLUMN     "confirmed_at" TIMESTAMPTZ,
ADD COLUMN     "confirmed_by_id" UUID,
ADD COLUMN     "replaced_at" TIMESTAMPTZ;

-- AddForeignKey
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_confirmed_by_id_fkey" FOREIGN KEY ("confirmed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CheckConstraint: un borrador no lleva confirmación ni sustitución.
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_draft_unconfirmed_check"
    CHECK ("status" <> 'DRAFT' OR ("confirmed_at" IS NULL AND "confirmed_by_id" IS NULL AND "replaced_at" IS NULL));

-- CheckConstraint: un oficial sabe cuándo y quién lo confirmó.
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_official_confirmed_check"
    CHECK ("status" <> 'OFFICIAL' OR ("confirmed_at" IS NOT NULL AND "confirmed_by_id" IS NOT NULL));

-- CheckConstraint: no se sustituye un horario antes de haberlo confirmado.
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_replaced_after_confirmed_check"
    CHECK ("replaced_at" IS NULL OR "replaced_at" >= "confirmed_at");

-- Un solo oficial vigente por colegio: los sustituidos (con replaced_at) se conservan y no cuentan. Prisma no expresa
-- los índices parciales, así que se escribe a mano (como schedules_draft_key).
CREATE UNIQUE INDEX "schedules_official_key" ON "schedules"("school_id") WHERE "status" = 'OFFICIAL' AND "replaced_at" IS NULL;
