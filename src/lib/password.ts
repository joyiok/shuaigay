import { z } from "zod";

/** 常见弱密码黑名单（小写归一后比对） */
const COMMON = new Set(
  [
    "password",
    "password1",
    "password123",
    "passw0rd",
    "12345678",
    "123456789",
    "11111111",
    "aaaaaaaa",
    "qwerty",
    "qwerty123",
    "abc123",
    "1q2w3e4r",
    "letmein",
    "welcome",
    "admin123",
    "shuaigay",
  ].map((s) => s.toLowerCase()),
);

/**
 * 密码强度：12 位以上直接过；8-11 位要求 4 类字符占 3 类，
 * 且不在常见弱密码名单里（顺手拦掉 aaaaaaaa 这类全同字符）。
 */
export function isStrongPassword(pw: string): boolean {
  if (typeof pw !== "string") return false;
  if (pw.length < 8 || pw.length > 72) return false;
  if (pw.length >= 12) return true;
  if (COMMON.has(pw.toLowerCase())) return false;
  if (/^(.)\1+$/.test(pw)) return false;
  let classes = 0;
  if (/[a-z]/.test(pw)) classes++;
  if (/[A-Z]/.test(pw)) classes++;
  if (/[0-9]/.test(pw)) classes++;
  if (/[^a-zA-Z0-9]/.test(pw)) classes++;
  return classes >= 3;
}

export const passwordSchema = z
  .string()
  .min(8)
  .max(72)
  .refine(isStrongPassword, { message: "weak" });
