-- AlterTable
ALTER TABLE "SubscriptionPlan" ADD COLUMN     "attendance" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "calendarScheduling" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "communications" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "identityCards" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "identitySafety" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "metadata" JSONB,
ADD COLUMN     "schoolWebsites" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "transport" BOOLEAN NOT NULL DEFAULT false;
