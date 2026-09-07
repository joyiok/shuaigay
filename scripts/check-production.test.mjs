import { test } from "node:test";
import assert from "node:assert/strict";
import { checkProduction } from "./check-production.mjs";

test("上线检查拒绝缺项、默认口令、测试验证码和错误域名", () => {
  const valid = { DOMAIN: "forum.test.dev", SITE_URL: "https://forum.test.dev", POSTGRES_PASSWORD: "test-db-long-password", RESTIC_PASSWORD: "test-backup-long-password", SMTP_URL: "smtps://smtp.test.dev", MAIL_FROM: "Forum <mail@test.dev>", NEXT_PUBLIC_TURNSTILE_SITE_KEY: "configured-site-key", TURNSTILE_SECRET_KEY: "configured-secret", TURNSTILE_HOSTNAMES: "forum.test.dev,www.forum.test.dev", SEED_ADMIN_EMAIL: "admin@test.dev", SEED_ADMIN_PASSWORD: "test-admin-long-password" };
  assert.deepEqual(checkProduction(valid), []);
  assert.ok(checkProduction({}).length > 0);
  for (const change of [{ SITE_URL: "http://localhost:3000" }, { POSTGRES_PASSWORD: "forum_dev_password" }, { NEXT_PUBLIC_TURNSTILE_SITE_KEY: "1x00000000000000000000AA" }, { TURNSTILE_HOSTNAMES: "localhost" }, { TURNSTILE_TEST_MODE: "1" }, { SMTP_URL: "invalid" }, { MAIL_FROM: "mail@example.com" }]) {
    assert.ok(checkProduction({ ...valid, ...change }).length > 0);
  }
});
