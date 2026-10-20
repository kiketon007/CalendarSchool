-- CreateEnum
CREATE TYPE "ProfessorPosition" AS ENUM ('DIRECTOR', 'JEFE_ESTUDIOS');

-- AlterTable
ALTER TABLE "classes" ADD COLUMN     "tutor_id" UUID;

-- CreateTable
CREATE TABLE "professors" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "first_name" VARCHAR(100) NOT NULL,
    "last_name" VARCHAR(100) NOT NULL,
    "position" "ProfessorPosition",
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "professors_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "professors_school_id_idx" ON "professors"("school_id");

-- CreateIndex
CREATE UNIQUE INDEX "classes_tutor_id_key" ON "classes"("tutor_id");

-- AddForeignKey
ALTER TABLE "professors" ADD CONSTRAINT "professors_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classes" ADD CONSTRAINT "classes_tutor_id_fkey" FOREIGN KEY ("tutor_id") REFERENCES "professors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

