"use client";

/**
 * 后台「用户管理」的即时过滤输入框。
 * 服务端组件不能挂事件处理器（React Server Components 限制），所以单独抽成客户端组件。
 */
export default function AdminUserSearch() {
  return (
    <input
      id="user-search"
      placeholder="搜索用户名/邮箱…"
      style={{
        height: 34,
        minWidth: 220,
        border: "1.5px solid var(--line)",
        borderRadius: 10,
        padding: "0 12px",
        fontSize: 13,
        background: "var(--panel)",
        boxShadow: "2px 2px 0 var(--line)",
        outline: "none",
      }}
      onInput={(e) => {
        const value = e.currentTarget.value.toLowerCase();
        document.querySelectorAll("[data-user-row]").forEach((el) => {
          const hay = (el.getAttribute("data-hay") ?? "").toLowerCase();
          (el as HTMLElement).style.display = !value || hay.includes(value) ? "" : "none";
        });
      }}
    />
  );
}
