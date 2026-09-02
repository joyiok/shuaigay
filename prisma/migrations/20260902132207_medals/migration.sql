-- CreateTable
CREATE TABLE "Medal" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT NOT NULL DEFAULT '🏅',
    "color" TEXT NOT NULL DEFAULT '#FFF7A8',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Medal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserMedal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "medalId" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserMedal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Medal_name_key" ON "Medal"("name");

-- CreateIndex
CREATE INDEX "UserMedal_userId_idx" ON "UserMedal"("userId");

-- CreateIndex
CREATE INDEX "UserMedal_medalId_idx" ON "UserMedal"("medalId");

-- CreateIndex
CREATE UNIQUE INDEX "UserMedal_userId_medalId_key" ON "UserMedal"("userId", "medalId");

-- AddForeignKey
ALTER TABLE "UserMedal" ADD CONSTRAINT "UserMedal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserMedal" ADD CONSTRAINT "UserMedal_medalId_fkey" FOREIGN KEY ("medalId") REFERENCES "Medal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed default medals
INSERT INTO "Medal" ("id", "name", "description", "icon", "color") VALUES
  ('medal_helpful', '热心助人', '热心回帖，助人为乐', '💖', '#FFE4E6'),
  ('medal_tech', '技术大神', '技术分享达人', '💻', '#E0F2FE'),
  ('medal_photo', '摄影达人', '用镜头记录生活', '📷', '#FEF3C7'),
  ('medal_veteran', '论坛元老', '陪伴社区成长', '🏆', '#FFF7A8'),
  ('medal_mod', '版主勋章', '版块守护者', '🛡️', '#EDE9FE')
ON CONFLICT ("id") DO NOTHING;
