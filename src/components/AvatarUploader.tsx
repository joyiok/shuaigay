"use client";

import { useRef, useState } from "react";

export default function AvatarUploader({
  username,
  initialUrl,
}: {
  username: string;
  initialUrl: string | null;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // initialUrl 已是 /api/avatar?file= 形式，或 null
  const currentSrc = preview ?? initialUrl;

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const f = e.target.files?.[0];
    if (!f) {
      setPreview(null);
      return;
    }
    if (f.size > 2 * 1024 * 1024) {
      setError("图片不能超过 2MB");
      return;
    }
    if (!["image/jpeg", "image/png", "image/gif", "image/webp"].includes(f.type)) {
      // 仍允许选择，后端会做魔数校验
    }
    const url = URL.createObjectURL(f);
    setPreview(url);
  };

  const onUpload = async () => {
    const file = inputRef.current?.files?.[0];
    if (!file) {
      setError("请先选择图片");
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("avatar", file);
      const res = await fetch("/api/avatar", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "上传失败");
        return;
      }
      // 上传成功刷新页面，让服务端拿到新 avatarUrl
      window.location.reload();
    } catch {
      setError("网络错误，请重试");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: 12,
            overflow: "hidden",
            background: "var(--brand-soft)",
            border: "1px solid var(--line)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          {currentSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={currentSrc}
              alt={`${username} 的头像`}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          ) : (
            <span style={{ fontWeight: 800, color: "var(--brand)", fontSize: 22 }}>
              {username.slice(0, 1).toUpperCase()}
            </span>
          )}
        </div>
        <div style={{ flex: 1, display: "grid", gap: 6 }}>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            onChange={onFileChange}
            style={{
              fontSize: 12,
              color: "var(--text-muted)",
            }}
          />
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={onUpload}
              disabled={uploading}
              style={{
                height: 28,
                padding: "0 12px",
                background: uploading ? "var(--line)" : "var(--brand)",
                color: uploading ? "var(--text-subtle)" : "#fff",
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 600,
                border: "1px solid var(--brand)",
                cursor: uploading ? "not-allowed" : "pointer",
              }}
            >
              {uploading ? "上传中..." : "上传头像"}
            </button>
            {preview && (
              <button
                type="button"
                onClick={() => {
                  setPreview(null);
                  if (inputRef.current) inputRef.current.value = "";
                }}
                style={{
                  height: 28,
                  padding: "0 12px",
                  background: "var(--panel)",
                  color: "var(--text-muted)",
                  borderRadius: 6,
                  fontSize: 12,
                  border: "1px solid var(--line)",
                }}
              >
                取消
              </button>
            )}
          </div>
          <span style={{ fontSize: 11, color: "var(--text-subtle)" }}>
            支持 JPG/PNG/GIF/WEBP，限 2MB，前端仅预览压缩，展示时等比裁剪
          </span>
        </div>
      </div>
      {error && (
        <p style={{ color: "var(--danger)", fontSize: 12, margin: 0, background: "var(--danger-soft)", border: "1px solid #fecaca", borderRadius: 6, padding: "6px 10px" }}>
          {error}
        </p>
      )}
    </div>
  );
}
