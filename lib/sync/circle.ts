// Circle stores the buyer's phone in a custom profile field and never passes it
// to Stripe. This looks the member up by email through the Circle Admin API v2.

const SEARCH_URL = "https://app.circle.so/api/admin/v2/community_members/search";

// Custom field keys differ per community ("telefon", "phone", "broj_telefona"…).
const PHONE_KEY = /telefon|phone|mobil/i;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function phoneFromCircleMember(member: any): string | null {
  const fields = member?.flattened_profile_fields ?? {};
  for (const [key, value] of Object.entries(fields)) {
    if (PHONE_KEY.test(key) && typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

// Returns null when the member is unknown, has no phone, or Circle is unreachable.
export async function fetchCirclePhone(token: string, email: string): Promise<string | null> {
  if (!token || !email) return null;
  try {
    const res = await fetch(`${SEARCH_URL}?email=${encodeURIComponent(email)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    return phoneFromCircleMember(await res.json());
  } catch {
    return null;
  }
}
