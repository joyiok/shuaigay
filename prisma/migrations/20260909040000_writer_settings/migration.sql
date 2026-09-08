-- AI 写作（小说生成）独立配置，与站点 AI 自动运营分离
CREATE TABLE "WriterSetting" (
    "id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "baseUrl" TEXT NOT NULL DEFAULT 'https://api.deepseek.com/v1',
    "model" TEXT NOT NULL DEFAULT 'deepseek-chat',
    "apiKeyEncrypted" TEXT,
    "temperature" DOUBLE PRECISION NOT NULL DEFAULT 0.85,
    "defaultWords" INTEGER NOT NULL DEFAULT 700,
    "defaultStatus" TEXT NOT NULL DEFAULT 'approved',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WriterSetting_pkey" PRIMARY KEY ("id")
);
