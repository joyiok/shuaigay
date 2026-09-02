-- AlterTable
ALTER TABLE "User" ADD COLUMN     "lastActiveAt" TIMESTAMP(3),
ADD COLUMN     "lastActiveIp" TEXT,
ADD COLUMN     "lastLoginAt" TIMESTAMP(3),
ADD COLUMN     "lastLoginIp" TEXT,
ADD COLUMN     "registrationIp" TEXT;

-- CreateTable
CREATE TABLE "UserIpLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserIpLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserIpLog_userId_createdAt_idx" ON "UserIpLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "UserIpLog_ip_createdAt_idx" ON "UserIpLog"("ip", "createdAt");

-- AddForeignKey
ALTER TABLE "UserIpLog" ADD CONSTRAINT "UserIpLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
