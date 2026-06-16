/**
 * 判断是否为"纯域名 / 首页 / 栏目根"这类无效来源链接（不是具体文章页）。
 * 无法解析的也视为无效。纯函数，无任何运行时依赖，供采集层与 UI 层共用。
 */
export function isLikelyHomepageUrl(rawUrl: string): boolean {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return true;
  }
  const path = u.pathname.replace(/\/+$/, "");
  if (path === "") return true; // 根域名 / 末尾斜杠
  const segments = path.split("/").filter(Boolean);
  if (segments.length === 0) return true;
  // 单段且是常见的首页/频道根（如 /index.html、/news、/zh）→ 视为首页
  if (segments.length === 1 && /^(index|index\.html?|index\.php|home|default\.html?|news|zh|cn|en|zh-cn)$/i.test(segments[0])) {
    return true;
  }
  return false;
}
