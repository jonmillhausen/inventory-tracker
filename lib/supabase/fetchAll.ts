/**
 * Pages a PostgREST query past the server's max-rows cap.
 *
 * Supabase enforces a hard row cap (1000 on this project) on every request.
 * An unbounded `.select('*')` does NOT error when a table exceeds it — it
 * quietly returns the first 1000 rows, and the caller has no way to tell a
 * truncated result from a complete one.
 *
 * That is how booking_items broke: the table crossed 1000 rows around
 * 2026-06-03, and every consumer silently lost the tail — which in physical
 * row order is the most recently written bookings.  The Availability page
 * rendered chain time windows (bookings: 837 rows, under the cap) while
 * showing no equipment for the bookings whose items fell past row 1000.
 *
 * Pass a factory that builds one page of the query, e.g.
 *
 *   fetchAll((from, to) => supabase.from('booking_items').select('*').range(from, to))
 *
 * A factory (rather than a prebuilt query) keeps each page a fresh request and
 * avoids depending on the builder's range-mutation semantics.
 */

export const PAGE_SIZE = 1000

// Backstop against an infinite loop if a server ever returns a full page while
// ignoring the requested offset.  5,000,000 rows is far beyond any table here.
const MAX_PAGES = 5000

export interface PageResult<T> {
  data: T[] | null
  error: unknown
}

export async function fetchAll<T>(
  makePage: (from: number, to: number) => PromiseLike<PageResult<T>>
): Promise<{ data: T[]; error: unknown }> {
  const all: T[] = []

  for (let page = 0; page < MAX_PAGES; page++) {
    const from = page * PAGE_SIZE
    const { data, error } = await makePage(from, from + PAGE_SIZE - 1)

    if (error) return { data: [], error }

    const rows = data ?? []
    all.push(...rows)

    // A short page means we've reached the end.  An exactly-full page is
    // ambiguous, so we make one more request to confirm.
    if (rows.length < PAGE_SIZE) return { data: all, error: null }
  }

  return {
    data: all,
    error: new Error(
      `fetchAll exceeded ${MAX_PAGES} pages (${MAX_PAGES * PAGE_SIZE} rows) — refusing to page further`
    ),
  }
}
