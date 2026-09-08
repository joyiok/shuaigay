-- 通知偏好：默认全开，历史用户不改变现有行为
ALTER TABLE "User" ADD COLUMN "notifyReply" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN "notifyFollow" BOOLEAN NOT NULL DEFAULT true;
