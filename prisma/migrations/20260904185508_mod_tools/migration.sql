-- AlterTable
ALTER TABLE "Thread" ADD COLUMN     "globalPinned" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "digested" BOOLEAN NOT NULL DEFAULT false;

-- 存量版块置顶即全局置顶:保持首页置顶区行为不变,之后可单独取消全局
UPDATE "Thread" SET "globalPinned" = "pinned" WHERE "pinned" = true;

-- CreateIndex
CREATE INDEX "Thread_globalPinned_idx" ON "Thread"("globalPinned");
