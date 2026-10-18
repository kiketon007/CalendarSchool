-- CreateEnum
CREATE TYPE "AccessLinkPurpose" AS ENUM ('INVITATION', 'PASSWORD_RESET');

-- CreateTable
CREATE TABLE "access_links" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "purpose" "AccessLinkPurpose" NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "role" "UserRole",
    "user_id" UUID,
    "created_by_id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "used_at" TIMESTAMPTZ,
    "revoked_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "access_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "access_links_token_hash_key" ON "access_links"("token_hash");

-- CreateIndex
CREATE INDEX "access_links_school_id_purpose_idx" ON "access_links"("school_id", "purpose");

-- AddForeignKey
ALTER TABLE "access_links" ADD CONSTRAINT "access_links_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_links" ADD CONSTRAINT "access_links_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_links" ADD CONSTRAINT "access_links_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Cada propósito exige sus campos y excluye los del otro: una invitación lleva `role` y no `user_id`;
-- un restablecimiento lleva `user_id` y no `role`. Prisma no modela los CHECK, así que se añade a mano.
ALTER TABLE "access_links" ADD CONSTRAINT "access_links_purpose_fields_check" CHECK (
  ("purpose" = 'INVITATION' AND "role" IS NOT NULL AND "user_id" IS NULL) OR
  ("purpose" = 'PASSWORD_RESET' AND "user_id" IS NOT NULL AND "role" IS NULL)
);

-- Un solo restablecimiento pendiente por usuario (al generar otro, la aplicación revoca el anterior).
-- Prisma tampoco modela los índices parciales, así que también se añade a mano.
CREATE UNIQUE INDEX "access_links_pending_reset_user_key" ON "access_links"("user_id")
  WHERE "purpose" = 'PASSWORD_RESET' AND "used_at" IS NULL AND "revoked_at" IS NULL;
