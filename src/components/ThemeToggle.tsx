"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark" | "system";

function applyTheme(t: Theme) {
  const root = document.documentElement;
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const dark = t === "dark" || (t === "system" && prefersDark);
  root.dataset.theme = dark ? "dark" : "light";
  root.style.colorScheme = dark ? "dark" : "light";
  try {
    localStorage.setItem("sg:theme", t);
  } catch {}
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("system");
  useEffect(() => {
    let initial: Theme = "system";
    try {
      const saved = localStorage.getItem("sg:theme");
      if (saved === "light" || saved === "dark" || saved === "system") initial = saved;
    } catch {}
    setTheme(initial);
    applyTheme(initial);
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      try {
        const cur = (localStorage.getItem("sg:theme") as Theme) || "system";
        if (cur === "system") applyTheme("system");
      } catch {}
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  const cycle = () => {
    const next: Theme = theme === "light" ? "dark" : theme === "dark" ? "system" : "light";
    setTheme(next);
    applyTheme(next);
  };
  const label = theme === "dark" ? "🌙 深色" : theme === "light" ? "☀️ 浅色" : "🖥️ 跟随系统";
  return (
    <button
      type="button"
      onClick={cycle}
      title={`主题：${label}（点击切换）`}
      aria-label={`切换主题，当前${label}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        height: 32,
        padding: "0 10px",
        borderRadius: 8,
        border: "1px solid rgba(255,255,255,0.35)",
        background: "rgba(255,255,255,0.12)",
        color: "var(--head-text)",
        fontSize: 12,
        fontWeight: 600,
        whiteSpace: "nowrap",
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}
