-- AlterEnum
ALTER TYPE "VerificationTokenType" ADD VALUE 'CHANGE_EMAIL';

-- AlterTable
ALTER TABLE "Favorite" ADD COLUMN     "lastSeenPosts" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Post" ADD COLUMN     "deleteReason" TEXT,
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedBy" TEXT;

-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "ip" TEXT,
ADD COLUMN     "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "ua" TEXT;

-- AlterTable
ALTER TABLE "Thread" ADD COLUMN     "deleteReason" TEXT,
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedBy" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "emailNotify" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "VerificationToken" ADD COLUMN     "email" TEXT;

-- CreateTable
CREATE TABLE "ReadingProgress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "postId" TEXT,
    "chapter" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReadingProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Block" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Block_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CheckIn" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 0,
    "streak" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CheckIn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ThreadTag" (
    "threadId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    CONSTRAINT "ThreadTag_pkey" PRIMARY KEY ("threadId","tagId")
);

-- CreateTable
CREATE TABLE "Poll" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "multiple" BOOLEAN NOT NULL DEFAULT false,
    "closesAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Poll_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PollOption" (
    "id" TEXT NOT NULL,
    "pollId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PollOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PollVote" (
    "id" TEXT NOT NULL,
    "pollId" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PollVote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReadingProgress_userId_updatedAt_idx" ON "ReadingProgress"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "ReadingProgress_threadId_idx" ON "ReadingProgress"("threadId");

-- CreateIndex
CREATE UNIQUE INDEX "ReadingProgress_userId_threadId_key" ON "ReadingProgress"("userId", "threadId");

-- CreateIndex
CREATE INDEX "Block_targetId_idx" ON "Block"("targetId");

-- CreateIndex
CREATE UNIQUE INDEX "Block_userId_targetId_key" ON "Block"("userId", "targetId");

-- CreateIndex
CREATE INDEX "CheckIn_day_idx" ON "CheckIn"("day");

-- CreateIndex
CREATE UNIQUE INDEX "CheckIn_userId_day_key" ON "CheckIn"("userId", "day");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_name_key" ON "Tag"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_slug_key" ON "Tag"("slug");

-- CreateIndex
CREATE INDEX "Tag_count_idx" ON "Tag"("count");

-- CreateIndex
CREATE INDEX "ThreadTag_tagId_idx" ON "ThreadTag"("tagId");

-- CreateIndex
CREATE UNIQUE INDEX "Poll_threadId_key" ON "Poll"("threadId");

-- CreateIndex
CREATE INDEX "PollOption_pollId_order_idx" ON "PollOption"("pollId", "order");

-- CreateIndex
CREATE INDEX "PollVote_pollId_idx" ON "PollVote"("pollId");

-- CreateIndex
CREATE INDEX "PollVote_userId_idx" ON "PollVote"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PollVote_pollId_userId_optionId_key" ON "PollVote"("pollId", "userId", "optionId");

-- AddForeignKey
ALTER TABLE "ReadingProgress" ADD CONSTRAINT "ReadingProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReadingProgress" ADD CONSTRAINT "ReadingProgress_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "Thread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Block" ADD CONSTRAINT "Block_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Block" ADD CONSTRAINT "Block_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckIn" ADD CONSTRAINT "CheckIn_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThreadTag" ADD CONSTRAINT "ThreadTag_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "Thread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThreadTag" ADD CONSTRAINT "ThreadTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Poll" ADD CONSTRAINT "Poll_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "Thread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PollOption" ADD CONSTRAINT "PollOption_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "Poll"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PollVote" ADD CONSTRAINT "PollVote_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "Poll"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PollVote" ADD CONSTRAINT "PollVote_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "PollOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PollVote" ADD CONSTRAINT "PollVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
