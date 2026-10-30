-- CreateEnum
CREATE TYPE "ConstraintType" AS ENUM ('MAX_PER_DAY', 'BLOCK', 'FORBIDDEN_SLOTS', 'PREFERRED_SLOTS');

-- CreateTable
CREATE TABLE "scheduling_constraints" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "type" "ConstraintType" NOT NULL,
    "max_per_day" SMALLINT,
    "block_size" SMALLINT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "scheduling_constraints_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "scheduling_constraints_course_id_idx" ON "scheduling_constraints"("course_id");

-- CreateIndex
CREATE INDEX "scheduling_constraints_school_id_idx" ON "scheduling_constraints"("school_id");

-- CreateIndex
CREATE UNIQUE INDEX "scheduling_constraints_subject_id_course_id_type_key" ON "scheduling_constraints"("subject_id", "course_id", "type");

-- AddForeignKey
ALTER TABLE "scheduling_constraints" ADD CONSTRAINT "scheduling_constraints_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduling_constraints" ADD CONSTRAINT "scheduling_constraints_subject_id_course_id_fkey" FOREIGN KEY ("subject_id", "course_id") REFERENCES "subject_courses"("subject_id", "course_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Restricciones escritas a mano (Prisma no genera CHECK): cada tipo de regla usa su columna y deja la otra
-- vacía. `MAX_PER_DAY` exige de 2 a 5 sesiones al día (sin regla, el máximo es 1), `BLOCK` un bloque de 2 o 3
-- sesiones, y los tipos de franjas (US19_c y US19_d, que aún no se escriben) no llevan ninguna de las dos.
ALTER TABLE "scheduling_constraints" ADD CONSTRAINT "scheduling_constraints_max_per_day_check"
    CHECK ("type" <> 'MAX_PER_DAY' OR ("max_per_day" BETWEEN 2 AND 5 AND "block_size" IS NULL));

ALTER TABLE "scheduling_constraints" ADD CONSTRAINT "scheduling_constraints_block_check"
    CHECK ("type" <> 'BLOCK' OR ("block_size" BETWEEN 2 AND 3 AND "max_per_day" IS NULL));

ALTER TABLE "scheduling_constraints" ADD CONSTRAINT "scheduling_constraints_slots_check"
    CHECK ("type" NOT IN ('FORBIDDEN_SLOTS', 'PREFERRED_SLOTS') OR ("max_per_day" IS NULL AND "block_size" IS NULL));
