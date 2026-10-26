-- CreateEnum
CREATE TYPE "SubjectType" AS ENUM ('CORE', 'ELECTIVE', 'CUSTOM');

-- CreateEnum
CREATE TYPE "SubjectStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "SubjectColor" AS ENUM ('blue', 'indigo', 'purple', 'pink', 'red', 'orange', 'yellow', 'green', 'teal', 'cyan', 'brown', 'gray');

-- CreateTable
CREATE TABLE "subjects" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "normalized_name" VARCHAR(100) NOT NULL,
    "code" VARCHAR(10),
    "normalized_code" VARCHAR(10),
    "type" "SubjectType" NOT NULL,
    "status" "SubjectStatus" NOT NULL,
    "description" VARCHAR(500),
    "color" "SubjectColor" NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subject_courses" (
    "subject_id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "sessions_per_week" SMALLINT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "subject_courses_pkey" PRIMARY KEY ("subject_id","course_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "subjects_school_id_normalized_name_key" ON "subjects"("school_id", "normalized_name");

-- CreateIndex
CREATE UNIQUE INDEX "subjects_school_id_normalized_code_key" ON "subjects"("school_id", "normalized_code");

-- CreateIndex
CREATE INDEX "subject_courses_course_id_idx" ON "subject_courses"("course_id");

-- AddForeignKey
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subject_courses" ADD CONSTRAINT "subject_courses_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subject_courses" ADD CONSTRAINT "subject_courses_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Restricción escrita a mano (Prisma no genera CHECK): las sesiones semanales de una asignatura en un curso
-- son de 1 a 5. El resto de reglas (cursos sin repetir, de 1 a 100 cursos, el color) se validan en la aplicación
-- y en los enums.
ALTER TABLE "subject_courses" ADD CONSTRAINT "subject_courses_sessions_per_week_check"
    CHECK ("sessions_per_week" BETWEEN 1 AND 5);
