import { SupabaseClient } from "@supabase/supabase-js";
import { belgradeDate, dayBounds } from "@/lib/utils/tz";
import { accountTarget, loadLiveInsights } from "./live-data";
import { evaluateAlerts, type Alert } from "./insights";

interface TelegramConfig { bot_token: string; chat_id: string | number }

async function sendTelegram(cfg: TelegramConfig, text: string): Promise<boolean> {
  const res = await fetch(`https://api.telegram.org/bot${cfg.bot_token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: cfg.chat_id, text }),
  }).catch(() => null);
  return !!res?.ok;
}

// Claims the alert for today first, so overlapping runs can't send it twice;
// a failed send gives the claim back and the next run retries.
async function sendOnce(supabase: SupabaseClient, cfg: TelegramConfig, alert: Alert, date: string): Promise<boolean> {
  const { data } = await supabase
    .from("meta_alerts_sent")
    .upsert({ key: alert.key, date }, { onConflict: "key,date", ignoreDuplicates: true })
    .select("key");
  if (!data?.length) return false;

  if (await sendTelegram(cfg, alert.text)) return true;
  await supabase.from("meta_alerts_sent").delete().eq("key", alert.key).eq("date", date);
  return false;
}

/** Evaluates every account and sends what hasn't gone out today. */
export async function runMetaAlerts(supabase: SupabaseClient) {
  const { data: secret } = await supabase.from("service_secrets").select("value").eq("key", "telegram").maybeSingle();
  const cfg = secret?.value as TelegramConfig | undefined;
  if (!cfg?.bot_token || !cfg?.chat_id) return { sent: 0, skipped: "telegram not configured" };

  const { accounts, rows, targets } = await loadLiveInsights(supabase, 30);
  const today = belgradeDate();
  const threeDaysAgo = belgradeDate(dayBounds(-3).start);

  let sent = 0;
  for (const a of accounts) {
    const own = rows.filter((r) => r.ad_account_id === a.id);
    const alerts = evaluateAlerts({
      accountName: a.name,
      accountId: a.id,
      accountStatus: a.meta_account_status,
      rows: own.filter((r) => r.date === today),
      recent: own.filter((r) => r.date >= threeDaysAgo && r.date < today),
      target: accountTarget(rows, a.id, targets).value,
    });
    for (const alert of alerts) if (await sendOnce(supabase, cfg, alert, today)) sent++;
  }
  return { sent };
}
