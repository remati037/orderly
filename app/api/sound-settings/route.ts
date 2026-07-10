import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/roles";
import { adminClient } from "@/lib/supabase/admin";

// GET /api/sound-settings
// Returns { global: SoundSettings, siteOverrides: Record<siteId, SiteOverride>, sites: Site[] }
export async function GET() {
  const { error: authError } = await requireRole(["owner"]);
  if (authError) return authError;

  const supabase = adminClient();

  const [settingsRes, sitesRes] = await Promise.all([
    supabase.from("settings").select("key, value").like("key", "sound%"),
    supabase.from("sites").select("id, name, color_hex").eq("is_active", true).order("created_at"),
  ]);

  const settingsMap: Record<string, unknown> = {};
  for (const row of settingsRes.data ?? []) {
    settingsMap[row.key] = row.value;
  }

  const globalDefaults = {
    enabled: true,
    volume: 70,
    soundUrl: null,
    soundFilename: null,
    triggerStatuses: ["processing", "completed"],
  };

  const global = { ...globalDefaults, ...(settingsMap["sound_settings"] as object ?? {}) };

  const siteOverrides: Record<string, { useCustom: boolean; soundUrl: string | null; soundFilename: string | null }> = {};
  for (const site of sitesRes.data ?? []) {
    const key = `sound_settings_site_${site.id}`;
    siteOverrides[site.id] = {
      useCustom: false,
      soundUrl: null,
      soundFilename: null,
      ...(settingsMap[key] as object ?? {}),
    };
  }

  return NextResponse.json({ global, siteOverrides, sites: sitesRes.data ?? [] });
}

// POST /api/sound-settings
// Body: { global?: SoundSettings, siteId?: string, override?: SiteOverride | null }
export async function POST(request: NextRequest) {
  const { error: authError } = await requireRole(["owner"]);
  if (authError) return authError;

  const body = await request.json();
  const supabase = adminClient();

  const upserts: Array<{ key: string; value: unknown }> = [];

  if (body.global !== undefined) {
    upserts.push({ key: "sound_settings", value: body.global });
  }

  if (body.siteId !== undefined) {
    const key = `sound_settings_site_${body.siteId}`;
    upserts.push({ key, value: body.override ?? null });
  }

  if (upserts.length === 0) {
    return NextResponse.json({ error: "Nothing to save" }, { status: 400 });
  }

  for (const row of upserts) {
    const { error } = await supabase
      .from("settings")
      .upsert({ key: row.key, value: row.value }, { onConflict: "key" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
