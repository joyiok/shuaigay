-- AlterTable
ALTER TABLE "Board" ADD COLUMN     "requireApproval" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Post" ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'approved';

-- AlterTable
ALTER TABLE "Thread" ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'approved';

-- CreateIndex
CREATE INDEX "Thread_status_idx" ON "Thread"("status");
CREATE INDEX "Post_status_idx" ON "Post"("status");
