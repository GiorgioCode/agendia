import { useQuery } from "@tanstack/react-query";
import { configured, rpc } from "./supabase";
import { tenantSlugFromLocation } from "./tenantResolver";
// A verified hostname wins over subdomain and route, including deep links.
export function useTenantResolution(path: string) {
  const host = window.location.hostname,
    root = import.meta.env.VITE_ROOT_DOMAIN || "";
  let appHost = host;
  try {
    appHost = new URL(
      import.meta.env.VITE_APP_BASE_URL || window.location.origin,
    ).hostname;
  } catch {
    /* fallback to the current origin */
  }
  const custom = ![
    appHost,
    root,
    `app.${root}`,
    `www.${root}`,
    "localhost",
    "127.0.0.1",
    "[::1]",
  ].includes(host);
  const q = useQuery({
    queryKey: ["host", host],
    queryFn: () => rpc("get_public_tenant_by_hostname", { p_hostname: host }),
    enabled: configured && custom,
  });
  return {
    slug: tenantSlugFromLocation(host, path, root, q.data?.[0]?.slug),
    loading: q.isLoading,
    error: q.error,
  };
}
