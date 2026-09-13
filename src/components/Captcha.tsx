"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import type { CaptchaAction } from "@/lib/captcha";

export default function Captcha({ action, resetSignal }: { action: CaptchaAction; resetSignal?: string | null }) {
  const [imageUrl, setImageUrl] = useState("");
  const [challengeId, setChallengeId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const imageUrlRef = useRef("");
  const answerRef = useRef<HTMLInputElement>(null);
  const { pending } = useFormStatus();

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(false);
    setChallengeId("");
    if (answerRef.current) answerRef.current.value = "";
    try {
      const response = await fetch(`/api/captcha?action=${encodeURIComponent(action)}`, { cache: "no-store" });
      const id = response.headers.get("x-captcha-id") ?? "";
      if (!response.ok || !id) throw new Error("captcha unavailable");
      const nextUrl = URL.createObjectURL(await response.blob());
      if (imageUrlRef.current) URL.revokeObjectURL(imageUrlRef.current);
      imageUrlRef.current = nextUrl;
      setImageUrl(nextUrl);
      setChallengeId(id);
      const testAnswer = response.headers.get("x-captcha-answer");
      if (testAnswer && answerRef.current) answerRef.current.value = testAnswer;
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [action]);

  useEffect(() => {
    void refresh();
  }, [refresh, resetSignal]);

  useEffect(() => () => {
    if (imageUrlRef.current) URL.revokeObjectURL(imageUrlRef.current);
  }, []);

  return (
    <fieldset className="captcha-field">
      <legend>安全验证</legend>
      <div className="captcha-row">
        <label className="captcha-answer">
          <span>输入图中 5 位数字</span>
          <input
            ref={answerRef}
            name="captcha-answer"
            required
            minLength={5}
            maxLength={5}
            pattern="[0-9]{5}"
            inputMode="numeric"
            autoComplete="off"
            aria-label="验证码"
            disabled={pending}
          />
        </label>
        <button type="button" className="captcha-image" onClick={refresh} disabled={loading || pending} aria-label="换一张验证码">
          {imageUrl && !error ? <img src={imageUrl} alt="五位数字验证码" width={150} height={48} /> : <span>{loading ? "正在出题…" : "加载失败"}</span>}
          <span className="captcha-refresh">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M20 6v5h-5M4 18v-5h5M6.1 9a7 7 0 0 1 11.7-2.6L20 9M4 15l2.2 2.6A7 7 0 0 0 17.9 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
            换一张
          </span>
        </button>
      </div>
      <input type="hidden" name="captcha-id" value={challengeId} />
      {error && <p role="alert">验证码暂时加载不了，请稍后重试。</p>}
    </fieldset>
  );
}
