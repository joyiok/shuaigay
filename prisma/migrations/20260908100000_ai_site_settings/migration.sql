ALTER TABLE "SiteSetting"
ADD COLUMN "aiAutomationEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "aiBaseUrl" TEXT NOT NULL DEFAULT 'https://api.openai.com/v1',
ADD COLUMN "aiModel" TEXT NOT NULL DEFAULT 'gpt-4o-mini',
ADD COLUMN "aiAutoConfidence" DOUBLE PRECISION NOT NULL DEFAULT 0.9;
