-- Make event_date nullable on bookings.
-- Zenbooker v3 payloads may omit the date field; inserting an empty string
-- into a date column causes "invalid input syntax for type date: ''".
-- Passing null is the correct representation for a missing date.

ALTER TABLE bookings
  ALTER COLUMN event_date DROP NOT NULL;
