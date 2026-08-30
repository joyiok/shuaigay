import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

async function main() {
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "admin@example.com";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "changeme123";

  await db.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      username: "admin",
      passwordHash: await bcrypt.hash(adminPassword, 12),
      role: "ADMIN",
    },
  });

  const boards = [
    { slug: "general", name: "综合讨论", description: "随便聊聊", order: 1 },
    { slug: "tech", name: "技术交流", description: "技术与开发", order: 2 },
  ];
  for (const board of boards) {
    await db.board.upsert({
      where: { slug: board.slug },
      update: {},
      create: board,
    });
  }

  // 敏感词默认种子(若表为空)
  const wordCount = await db.sensitiveWord.count();
  if (wordCount === 0) {
    const defaults = ["傻逼", "傻b", "草泥马", "操你妈", "妈逼", "狗娘养", "去死吧", "婊子", "nmsl", "cnm"];
    for (const w of defaults) {
      await db.sensitiveWord.upsert({ where: { word: w }, update: {}, create: { word: w } });
    }
    console.log(`seed 敏感词 ${defaults.length} 个`);
  }

  console.log(`seed 完成:管理员 ${adminEmail} + 默认版块`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
