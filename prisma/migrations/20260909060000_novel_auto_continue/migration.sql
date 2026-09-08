-- 自动追更：作品级开关 + AI 写作配置
ALTER TABLE "Thread" ADD COLUMN "autoContinue" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "WriterSetting" ADD COLUMN "autoContinueEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "WriterSetting" ADD COLUMN "autoContinueIntervalHours" INTEGER NOT NULL DEFAULT 24;
ALTER TABLE "WriterSetting" ADD COLUMN "autoContinueMaxPerRun" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "WriterSetting" ADD COLUMN "autoContinueDailyCap" INTEGER NOT NULL DEFAULT 3;
ALTER TABLE "WriterSetting" ADD COLUMN "autoContinueStatus" TEXT NOT NULL DEFAULT 'pending';
