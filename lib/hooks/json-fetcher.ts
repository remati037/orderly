// Shared SWR fetcher — throws on non-2xx so SWR exposes `error` instead of
// caching an error body as data.
export async function jsonFetcher<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<T>;
}
