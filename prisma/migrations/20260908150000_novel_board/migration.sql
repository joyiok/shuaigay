INSERT INTO "Board" ("id", "slug", "name", "description", "order", "createdAt")
VALUES ('board_novel', 'novel', '小说', '原创连载 · 短篇故事 · 在这里写，也在这里读', 6, CURRENT_TIMESTAMP)
ON CONFLICT ("slug") DO NOTHING;

INSERT INTO "ThreadCategory" ("id", "boardId", "name", "order", "createdAt")
SELECT 'novel_category_' || category.slug, board."id", category.name, category.position, CURRENT_TIMESTAMP
FROM "Board" AS board
CROSS JOIN (VALUES
  ('urban', '都市', 1),
  ('mystery', '悬疑', 2),
  ('fantasy', '奇幻', 3),
  ('scifi', '科幻', 4),
  ('short', '短篇', 5)
) AS category(slug, name, position)
WHERE board."slug" = 'novel'
ON CONFLICT ("boardId", "name") DO NOTHING;
