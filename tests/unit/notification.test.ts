import { describe, expect, it } from "vitest";
import {
  collectMentionCandidates,
  linkMentions,
} from "@/lib/markdown";
import {
  buildAnnouncementRows,
  chunkIds,
  excerptForNotify,
  planMentionNotifications,
  planReplyNotifications,
} from "@/lib/notify";

describe("collectMentionCandidates @提及解析", () => {
  it("收集普通提及,去重", () => {
    expect(collectMentionCandidates(["@alice 你好 @bob 嗨"])).toEqual(["alice", "bob"]);
  });

  it("不收集邮箱、仓库路径里的 @", () => {
    expect(collectMentionCandidates(["联系 foo@bar.com 或 user@example.org"])).toEqual([]);
    expect(collectMentionCandidates(["github 仓库 github.com/org/repo"])).toEqual([]);
  });

  it("中英文标点/括号后的 @ 算边界,中文汉字前的 @ 不算", () => {
    expect(collectMentionCandidates(["（@alice）来着", "。@bob 说的"])).toEqual(["alice", "bob"]);
    // 中文紧贴 @ 不是合法提及,避免误伤
    expect(collectMentionCandidates(["看看@alice 怎么样"])).toEqual([]);
  });

  it("markdown 符号边界的 @ 也收集", () => {
    expect(collectMentionCandidates(["[@alice](/u/alice) 和 **@bob**"])).toEqual(["alice", "bob"]);
  });

  it("多个原文批量收集,重复只算一次", () => {
    expect(collectMentionCandidates(["@alice 1", "@bob 2 @alice 3", "普通文本"])).toEqual(["alice", "bob"]);
  });

  it("不满足 3-20 位用户名规则的忽略", () => {
    expect(collectMentionCandidates(["@ab 太短", "@a_very_long_username_exceeds 太长"])).toEqual([]);
  });
});

describe("linkMentions 渲染链接", () => {
  const existing = new Set(["Alice", "bob_dev"]);

  it("已存在的用户替换成主页链接,保持库里的规范大小写", () => {
    const html = linkMentions("@alice 和 @bob_dev 好", existing);
    expect(html).toContain('<a class="post-mention" href="/u/Alice">@Alice</a>');
    expect(html).toContain('<a class="post-mention" href="/u/bob_dev">@bob_dev</a>');
  });

  it("不存在的用户名保持原样", () => {
    const html = linkMentions("哈哈 @ghost 不存在", existing);
    expect(html).toContain("@ghost");
    expect(html).not.toContain("post-mention");
  });

  it("空用户集时原样返回", () => {
    const html = linkMentions("@alice 你好", new Set());
    expect(html).toBe("@alice 你好");
  });

  it("跳过 <pre>/<code>/<a> 内部,不破坏代码块和已有链接", () => {
    const html = linkMentions(
      "<pre>@alice\n</pre><p>正文 <code>@alice</code></p><p><a href=\"/t/1\">@alice</a></p><p>外面 @alice</p>",
      existing,
    );
    expect(html).toContain("<pre>@alice");
    expect(html).toContain("<code>@alice</code>");
    expect(html).toContain('<a href="/t/1">@alice</a>');
    // 只有标签外那一处被替换
    expect(html.match(/post-mention/g)).toHaveLength(1);
  });
});

describe("通知计划去重", () => {
  it("回复通知:楼主收 reply,被提及者收 mention,自己排除", () => {
    const plan = planReplyNotifications({
      actorId: "me",
      threadAuthorId: "owner",
      mentionedUserIds: ["owner", "friend", "me"],
    });
    expect(plan).toEqual([
      { userId: "owner", kind: "reply" },
      { userId: "friend", kind: "mention" },
    ]);
  });

  it("楼主同时被提及:只发一条 reply,不重复 mention", () => {
    const plan = planReplyNotifications({
      actorId: "me",
      threadAuthorId: "owner",
      mentionedUserIds: ["owner", "owner"],
    });
    expect(plan).toEqual([{ userId: "owner", kind: "reply" }]);
  });

  it("回自己帖子且没提及任何人:不产生通知", () => {
    expect(
      planReplyNotifications({
        actorId: "me",
        threadAuthorId: "me",
        mentionedUserIds: [],
      }),
    ).toEqual([]);
  });

  it("多个被提及者每人一条,重复提及去重", () => {
    const plan = planReplyNotifications({
      actorId: "me",
      threadAuthorId: "owner",
      mentionedUserIds: ["a", "b", "a", "c"],
    });
    expect(plan).toEqual([
      { userId: "owner", kind: "reply" },
      { userId: "a", kind: "mention" },
      { userId: "b", kind: "mention" },
      { userId: "c", kind: "mention" },
    ]);
  });

  it("新主题提及通知:排除自己、去重", () => {
    expect(
      planMentionNotifications({ actorId: "me", mentionedUserIds: ["x", "me", "x", "y"] }),
    ).toEqual(["x", "y"]);
    expect(planMentionNotifications({ actorId: "me", mentionedUserIds: ["me"] })).toEqual([]);
  });

  it("通知正文去空白并截断", () => {
    expect(excerptForNotify("多  空格\n换行", 20)).toBe("多 空格 换行");
    expect(excerptForNotify("a".repeat(300), 120).length).toBe(120);
  });

  it("全站公告:去重去空,一人一行 system 通知", () => {
    const rows = buildAnnouncementRows(["a", "b", "a", ""], { title: "停机", body: "今晚", link: "/t/1" });
    expect(rows).toEqual([
      { userId: "a", type: "system", title: "停机", body: "今晚", link: "/t/1" },
      { userId: "b", type: "system", title: "停机", body: "今晚", link: "/t/1" },
    ]);
  });

  it("全站公告:缺省 body/link 为 null", () => {
    expect(buildAnnouncementRows(["a"], { title: "嗨" })).toEqual([
      { userId: "a", type: "system", title: "嗨", body: null, link: null },
    ]);
  });

  it("分块:按指定大小切分", () => {
    expect(chunkIds(["a", "b", "c", "d", "e"], 2)).toEqual([["a", "b"], ["c", "d"], ["e"]]);
    expect(chunkIds([], 500)).toEqual([]);
  });
});