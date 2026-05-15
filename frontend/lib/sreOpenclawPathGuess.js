/**
 * 判断字符串是否像 OpenClaw 产物绝对/相对路径（用于阶段 content JSON 顶层字段引用解析）。
 */
export function isProbableOpenClawPathString(s) {
  if (typeof s !== "string") return false;
  const t = s.trim();
  if (t.length < 4 || t.includes("\n") || t.includes("\r")) return false;
  if (t.startsWith("file://")) return isProbableOpenClawPathString(t.replace(/^file:\/\//i, ""));
  if (t.startsWith("/") || t.startsWith("~/")) return true;
  if (/^[A-Za-z]:[\\/]/.test(t)) return true;
  if (t.startsWith("./") || t.startsWith("../")) return true;
  if ((t.includes("/") || t.includes("\\")) && /\.[a-z0-9]{1,8}$/i.test(t)) return true;
  return false;
}
