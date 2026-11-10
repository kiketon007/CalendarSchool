-- AlterTable
ALTER TABLE "schedule_generations" ADD COLUMN     "engine" "ScheduleEngine" NOT NULL DEFAULT 'BACKTRACKING';
