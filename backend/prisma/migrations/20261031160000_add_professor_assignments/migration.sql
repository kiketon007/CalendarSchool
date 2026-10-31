-- CreateTable
CREATE TABLE "professor_assignments" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "professor_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "professor_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "professor_assignments_professor_id_idx" ON "professor_assignments"("professor_id");

-- CreateIndex
CREATE INDEX "professor_assignments_course_id_idx" ON "professor_assignments"("course_id");

-- CreateIndex
CREATE UNIQUE INDEX "professor_assignments_subject_id_class_id_key" ON "professor_assignments"("subject_id", "class_id");

-- CreateIndex
CREATE UNIQUE INDEX "classes_id_course_id_key" ON "classes"("id", "course_id");

-- AddForeignKey
ALTER TABLE "professor_assignments" ADD CONSTRAINT "professor_assignments_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "professor_assignments" ADD CONSTRAINT "professor_assignments_professor_id_fkey" FOREIGN KEY ("professor_id") REFERENCES "professors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "professor_assignments" ADD CONSTRAINT "professor_assignments_subject_id_course_id_fkey" FOREIGN KEY ("subject_id", "course_id") REFERENCES "subject_courses"("subject_id", "course_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "professor_assignments" ADD CONSTRAINT "professor_assignments_class_id_course_id_fkey" FOREIGN KEY ("class_id", "course_id") REFERENCES "classes"("id", "course_id") ON DELETE CASCADE ON UPDATE CASCADE;

