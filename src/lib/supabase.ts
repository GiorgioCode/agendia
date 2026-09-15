import { createClient } from "@supabase/supabase-js";
import type { RpcResults } from "../types/models";
const url = import.meta.env.VITE_SUPABASE_URL;
const key =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY;
export const configured = Boolean(url && key);
export const supabase = createClient(
  url || "http://127.0.0.1:54321",
  key || "configuration-required",
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
);
export async function rpc<K extends keyof RpcResults>(
  name: K,
  args?: Record<string, unknown>,
): Promise<RpcResults[K]> {
  if (!configured) throw new Error("CONFIGURATION_REQUIRED");
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw error;
  return data as RpcResults[K];
}
export async function rows<T>(
  table: string,
  tenantId?: string,
  select = "*",
): Promise<T[]> {
  if (!configured) throw new Error("CONFIGURATION_REQUIRED");
  const result: T[] = [];
  for (let offset = 0; ; offset += 500) {
    let query = supabase
      .from(table)
      .select(select)
      .order("id")
      .range(offset, offset + 499);
    if (tenantId) query = query.eq("tenant_id", tenantId);
    const { data, error } = await query;
    if (error) throw error;
    result.push(...(data as unknown as T[]));
    if (data.length < 500) return result;
  }
}
export async function saveRow(
  table: string,
  tenantId: string,
  value: Record<string, unknown>,
  id?: string,
) {
  const query = id
    ? supabase.from(table).update(value).eq("tenant_id", tenantId).eq("id", id)
    : supabase.from(table).insert({ ...value, tenant_id: tenantId });
  const { data, error } = await query.select("id").single();
  if (error) throw error;
  return data.id as string;
}
export const assetUrl = (path: string | null) =>
  path
    ? supabase.storage.from("tenant-assets").getPublicUrl(path).data.publicUrl
    : undefined;
