-- Add arena_pickup to the event_type enum
-- Represents customer pickup from an arena/venue (as opposed to home delivery)
ALTER TYPE event_type ADD VALUE IF NOT EXISTS 'arena_pickup';
