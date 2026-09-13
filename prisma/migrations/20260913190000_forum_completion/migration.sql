ALTER TABLE "User" ADD COLUMN "deletedAt" TIMESTAMP(3);

ALTER TABLE "DirectMessage"
  ADD COLUMN "senderDeletedAt" TIMESTAMP(3),
  ADD COLUMN "receiverDeletedAt" TIMESTAMP(3);

CREATE INDEX "DirectMessage_senderId_senderDeletedAt_createdAt_idx"
  ON "DirectMessage"("senderId", "senderDeletedAt", "createdAt");
CREATE INDEX "DirectMessage_receiverId_receiverDeletedAt_createdAt_idx"
  ON "DirectMessage"("receiverId", "receiverDeletedAt", "createdAt");

-- 中文与任意子串搜索不适合 PostgreSQL 默认分词；trigram 可直接加速现有 ILIKE '%词%'.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX "Thread_title_trgm_idx" ON "Thread" USING GIN ("title" gin_trgm_ops)
  WHERE "status" = 'approved';
CREATE INDEX "Post_contentMd_trgm_idx" ON "Post" USING GIN ("contentMd" gin_trgm_ops)
  WHERE "status" = 'approved';
