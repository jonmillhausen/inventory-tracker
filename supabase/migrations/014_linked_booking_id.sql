-- ── linked_booking_id: bidirectional drop-off ↔ pickup link ─────────────────
-- Links a drop-off booking to its corresponding Wonderfly Games Pickup (or
-- Wonderfly Arena Return) booking and vice versa.  The column is nullable
-- because most bookings have no linked partner.
--
-- ON DELETE SET NULL: if either booking is deleted the other's link is cleared
-- automatically rather than cascading the delete.
--
-- Used by:
--   • Import route  — sets both sides after upserting a pickup booking
--   • Availability  — extends the active date range for drop-off bookings
--     from their own event_date through the linked pickup's event_date, so
--     equipment loaned for multi-day drop-offs is correctly shown as blocked
--     on intermediate dates.

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS linked_booking_id uuid REFERENCES bookings(id) ON DELETE SET NULL;
