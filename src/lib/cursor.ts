export interface Cursor {
  /** ISO 时间字符串,配合 id 做稳定排序的游标 */
  t: string;
  id: string;
}

export function encodeCursor(c: Cursor): string {
  return Buffer.from(JSON.stringify(c), "utf8").toString("base64url");
}

export function decodeCursor(raw: string | undefined | null): Cursor | null {
  if (!raw) return null;
  try {
    const obj = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    if (typeof obj?.t === "string" && typeof obj?.id === "string") {
      return { t: obj.t, id: obj.id };
    }
    return null;
  } catch {
    // 任何伪造/损坏的游标都当作第一页处理,不抛错
    return null;
  }
}
