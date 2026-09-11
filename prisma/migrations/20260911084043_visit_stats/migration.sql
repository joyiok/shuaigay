-- AlterTable
ALTER TABLE "WriterSetting" ALTER COLUMN "id" SET DEFAULT 'writer';

-- CreateTable
CREATE TABLE "VisitDaily" (
    "id" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "path" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'XX',
    "referrer" TEXT NOT NULL DEFAULT '',
    "device" TEXT NOT NULL DEFAULT 'desktop',
    "pv" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VisitDaily_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VisitDaily_day_idx" ON "VisitDaily"("day");

-- CreateIndex
CREATE INDEX "VisitDaily_country_day_idx" ON "VisitDaily"("country", "day");

-- CreateIndex
CREATE UNIQUE INDEX "VisitDaily_day_path_country_referrer_device_key" ON "VisitDaily"("day", "path", "country", "referrer", "device");
