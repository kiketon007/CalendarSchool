-- CreateTable
CREATE TABLE "rate_limit_attempts" (
    "id" UUID NOT NULL,
    "key" VARCHAR(200) NOT NULL,
    "attempted_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "rate_limit_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "rate_limit_attempts_key_attempted_at_idx" ON "rate_limit_attempts"("key", "attempted_at");
