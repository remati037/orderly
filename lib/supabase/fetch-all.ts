// PostgREST caps every response at max_rows (1000 on Supabase by default), so a
// plain select silently drops everything past the first 1000 rows. Any query
// whose rows get summed/counted in JS must go through this helper.
//
// `build` must return a fresh query each call (builders mutate on .range()) and
// should include a deterministic .order(), e.g. .order("id"), so pages don't
// overlap or skip rows.

const PAGE_SIZE = 1000;

interface RangeableQuery<T> {
  range(from: number, to: number): PromiseLike<{ data: T[] | null; error: unknown }>;
}

export async function fetchAll<T>(
  build: () => RangeableQuery<T>
): Promise<{ data: T[]; error: unknown }> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await build().range(from, from + PAGE_SIZE - 1);
    if (error) return { data: rows, error };
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
  }
  return { data: rows, error: null };
}
