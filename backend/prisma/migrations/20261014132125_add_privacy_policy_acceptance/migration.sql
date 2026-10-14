-- AlterTable
ALTER TABLE "users" ADD COLUMN     "privacy_policy_accepted_at" TIMESTAMPTZ,
ADD COLUMN     "privacy_policy_version" VARCHAR(20);

-- La fecha y la versión de la aceptación van juntas: las dos o ninguna (las cuentas anteriores al
-- consentimiento tienen las dos a NULL). Prisma no modela los CHECK, así que se añade a mano.
ALTER TABLE "users" ADD CONSTRAINT "users_privacy_policy_acceptance_check"
  CHECK (("privacy_policy_accepted_at" IS NULL) = ("privacy_policy_version" IS NULL));
