/**
 * 生成利于 SEO 的 slug：中文保留原样（encode 后由浏览器显示），
 * 英文转小写，空格/下划线转 -，过滤非法字符，截断 60。
 * 返回空时回退为 "post"。
 */
export function slugify(input: string): string {
  const s = input
    .trim()
    .toLowerCase()
    // 保留中文、字母、数字，空格和下划线转 -
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9\u4e00-\u9fa5-]+/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  return s || "post";
}

/** 帖子链接：/t/{id}-{slug}，slug 仅为 SEO 装饰，后端只取 id */
export function threadHref(id: string, title: string, boardSlug?: string): string {
  const slug = slugify(title);
  // 兼容旧的纯 id 链接，同时新链接带 slug 更易读
  return boardSlug ? `/t/${id}-${slug}` : `/t/${id}-${slug}`;
}

/** 从 URL 的 id 段提取真实 cuid（取首段到第一个 - 之前，或整体） */
export function parseThreadId(raw: string): string {
  const id = raw.split("-")[0] ?? raw;
  // cuid 长度 25，以 c 开头；若不是则回退整体
  if (/^c[a-z0-9]{24}$/.test(id)) return id;
  // 兼容旧的完整 cuid 带 - 的情况，取前 25 字符
  const m = raw.match(/^c[a-z0-9]{24}/);
  return m ? m[0] : raw;
}
