-- CreateTable
CREATE TABLE "scheduling_constraint_slots" (
    "constraint_id" UUID NOT NULL,
    "day_of_week" SMALLINT NOT NULL,
    "session_number" SMALLINT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scheduling_constraint_slots_pkey" PRIMARY KEY ("constraint_id","day_of_week","session_number")
);

-- AddForeignKey
ALTER TABLE "scheduling_constraint_slots" ADD CONSTRAINT "scheduling_constraint_slots_constraint_id_fkey" FOREIGN KEY ("constraint_id") REFERENCES "scheduling_constraints"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Restricciones escritas a mano (Prisma no genera CHECK): el día es de lunes (1) a viernes (5) y la sesión, de
-- la 1ª a la 8ª, el máximo de sesiones de la jornada de un calendario (MAX_SESSIONS de US-BASE). Si ese límite
-- sube, hay que cambiar este CHECK con una migración.
ALTER TABLE "scheduling_constraint_slots" ADD CONSTRAINT "scheduling_constraint_slots_day_of_week_check"
    CHECK ("day_of_week" BETWEEN 1 AND 5);

ALTER TABLE "scheduling_constraint_slots" ADD CONSTRAINT "scheduling_constraint_slots_session_number_check"
    CHECK ("session_number" BETWEEN 1 AND 8);
