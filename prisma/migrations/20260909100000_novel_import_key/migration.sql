ALTER TABLE "Thread" ADD COLUMN "importKey" TEXT;

CREATE UNIQUE INDEX "Thread_importKey_key" ON "Thread"("importKey");
