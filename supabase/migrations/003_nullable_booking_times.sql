-- Make start_time and end_time nullable on bookings.
-- Zenbooker v3 payloads can omit end_time (time_slot.end_time = null),
-- and inserting an empty string into a time column causes a type error.
-- Passing null is the correct representation for a missing time.

ALTER TABLE bookings
  ALTER COLUMN start_time DROP NOT NULL,
  ALTER COLUMN end_time   DROP NOT NULL;
