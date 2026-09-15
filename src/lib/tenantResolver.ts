export function tenantSlugFromLocation(
  hostname: string,
  path: string,
  rootDomain: string,
  verifiedSlug?: string,
) {
  if (verifiedSlug) return verifiedSlug;
  const host = hostname.toLowerCase();
  const root = rootDomain.toLowerCase().replace(/^\.+|\.+$/g, "");
  if (root && host.endsWith("." + root)) {
    const sub = host.slice(0, -root.length - 1);
    if (!["app", "www"].includes(sub) && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(sub))
      return sub;
  }
  return path.match(/^\/t\/([a-z0-9]+(?:-[a-z0-9]+)*)(?:\/|$)/)?.[1] ?? null;
}
export function safeReturn(value: string | null) {
  return value &&
    value.startsWith("/") &&
    !value.startsWith("//") &&
    !value.includes("\\")
    ? value
    : "/account";
}
