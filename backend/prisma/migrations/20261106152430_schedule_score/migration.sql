-- CreateEnum
CREATE TYPE "GenerationPhase" AS ENUM ('SEARCHING', 'IMPROVING');

-- AlterTable
ALTER TABLE "schedule_generations" ADD COLUMN     "improve" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "phase" "GenerationPhase" NOT NULL DEFAULT 'SEARCHING',
ADD COLUMN     "score" JSONB;

-- AlterTable
ALTER TABLE "schedules" ADD COLUMN     "score" JSONB;
