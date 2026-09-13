-- AlterTable
ALTER TABLE "Board" ADD COLUMN     "group" TEXT NOT NULL DEFAULT '默认分区',
ADD COLUMN     "parentId" TEXT;

-- AlterTable
ALTER TABLE "Thread" ADD COLUMN     "pinnedUntil" TIMESTAMP(3),
ADD COLUMN     "publishAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "customTitle" TEXT;

-- AddForeignKey
ALTER TABLE "Board" ADD CONSTRAINT "Board_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Board"("id") ON DELETE SET NULL ON UPDATE CASCADE;
