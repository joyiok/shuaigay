-- 省/州维度：Cloudflare cf-ipregion（CF 后台开启 Add visitor location headers 后才有值）
ALTER TABLE "VisitDaily" ADD COLUMN "region" TEXT NOT NULL DEFAULT '';

DROP INDEX "VisitDaily_day_path_country_referrer_device_key";
CREATE UNIQUE INDEX "VisitDaily_day_path_country_region_referrer_device_key"
  ON "VisitDaily"("day", "path", "country", "region", "referrer", "device");
CREATE INDEX "VisitDaily_region_day_idx" ON "VisitDaily"("region", "day");
