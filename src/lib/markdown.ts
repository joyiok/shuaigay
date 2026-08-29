import { marked } from "marked";
import sanitizeHtml from "sanitize-html";

marked.setOptions({ gfm: true, breaks: true });

export function renderMarkdown(md: string): string {
  const raw = String(marked.parse(md ?? ""));
  return sanitizeHtml(raw, {
    allowedTags: [...sanitizeHtml.defaults.allowedTags, "img", "del"],
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      a: [...(sanitizeHtml.defaults.allowedAttributes.a ?? []), "rel"],
      img: ["src", "alt", "title", "loading"],
    },
    // 只允许 http(s)/mailto,srcdoc、javascript: 之类全被剥掉
    allowedSchemes: ["http", "https", "mailto"],
    // javascript: 的图片 src 被剥掉后会变成无 src 的空 img，直接整标签移除
    exclusiveFilter(frame) {
      if (frame.tag === "img" && !frame.attribs.src) return true;
      return false;
    },
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", {
        rel: "noopener noreferrer nofollow",
      }),
    },
  });
}
