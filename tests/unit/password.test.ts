import { describe, expect, it } from "vitest";
import { isStrongPassword } from "@/lib/password";

describe("isStrongPassword", () => {
  it("12 位以上直接过", () => {
    expect(isStrongPassword("correct horse 999")).toBe(true);
  });
  it("8 位+3 类字符过", () => {
    expect(isStrongPassword("Abc123!x")).toBe(true);
  });
  it("Password1! 这类常见弱密码不过", () => {
    expect(isStrongPassword("Password1")).toBe(false);
    expect(isStrongPassword("password123")).toBe(false);
  });
  it("全同字符不过", () => {
    expect(isStrongPassword("aaaaaaaa")).toBe(false);
  });
  it("8 位以下不过", () => {
    expect(isStrongPassword("Ab1!")).toBe(false);
  });
  it("只有 2 类字符不过", () => {
    expect(isStrongPassword("abcdefgh")).toBe(false);
    expect(isStrongPassword("12345678")).toBe(false);
  });
});
