-- CreateTable
CREATE TABLE "students" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "course_id" UUID,
    "class_id" UUID,
    "first_name" VARCHAR(100) NOT NULL,
    "last_name" VARCHAR(100) NOT NULL,
    "cafeteria" BOOLEAN NOT NULL,
    "scholarship" BOOLEAN,
    "food_type" VARCHAR(255),
    "observations" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "students_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "students_school_id_idx" ON "students"("school_id");

-- CreateIndex
CREATE INDEX "students_course_id_idx" ON "students"("course_id");

-- CreateIndex
CREATE INDEX "students_class_id_idx" ON "students"("class_id");

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Restricciones escritas a mano (Prisma no genera CHECK): sin comedor no hay beca ni tipo de comida, y con
-- comedor la beca siempre tiene respuesta.
ALTER TABLE "students" ADD CONSTRAINT "students_cafeteria_check"
    CHECK ("cafeteria" OR ("scholarship" IS NULL AND "food_type" IS NULL));

ALTER TABLE "students" ADD CONSTRAINT "students_scholarship_check"
    CHECK (NOT "cafeteria" OR "scholarship" IS NOT NULL);
