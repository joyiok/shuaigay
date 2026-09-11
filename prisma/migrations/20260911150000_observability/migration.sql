CREATE TABLE "ErrorDaily" (
  "id" TEXT NOT NULL,
  "day" DATE NOT NULL,
  "kind" TEXT NOT NULL,
  "path" TEXT NOT NULL,
  "count" INTEGER NOT NULL DEFAULT 0,
  "lastAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastReferrer" TEXT NOT NULL DEFAULT '',
  "lastUa" TEXT NOT NULL DEFAULT '',
  CONSTRAINT "ErrorDaily_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ErrorDaily_day_kind_path_key" ON "ErrorDaily"("day", "kind", "path");
CREATE INDEX "ErrorDaily_day_idx" ON "ErrorDaily"("day");

CREATE TABLE "VitalDaily" (
  "id" TEXT NOT NULL,
  "day" DATE NOT NULL,
  "metric" TEXT NOT NULL,
  "device" TEXT NOT NULL,
  "count" INTEGER NOT NULL DEFAULT 0,
  "sumValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "goodCount" INTEGER NOT NULL DEFAULT 0,
  "worst" DOUBLE PRECISION NOT NULL DEFAULT 0,
  CONSTRAINT "VitalDaily_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "VitalDaily_day_metric_device_key" ON "VitalDaily"("day", "metric", "device");
CREATE INDEX "VitalDaily_day_idx" ON "VitalDaily"("day");

CREATE TABLE "MailFailure" (
  "id" TEXT NOT NULL,
  "to" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "error" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MailFailure_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "MailFailure_createdAt_idx" ON "MailFailure"("createdAt");
