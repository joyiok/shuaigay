-- CreateTable
CREATE TABLE "PointTransaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "balance" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "refType" TEXT,
    "refId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PointTransaction_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE INDEX "PointTransaction_userId_createdAt_idx" ON "PointTransaction"("userId", "createdAt");
CREATE INDEX "PointTransaction_refType_refId_idx" ON "PointTransaction"("refType", "refId");

-- AddForeignKey
ALTER TABLE "PointTransaction" ADD CONSTRAINT "PointTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 历史余额期初结转：此前加分无明细，按迁移时余额插一条 opening_balance，此后每笔必留痕
INSERT INTO "PointTransaction" ("id", "userId", "delta", "balance", "reason", "createdAt")
SELECT 'opening_' || "id", "id", "points", "points", 'opening_balance', CURRENT_TIMESTAMP
FROM "User" WHERE "points" <> 0;
