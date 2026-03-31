-- Standardize equipment categories to the fixed category set used by the UI.
-- Preserve GameTruck values for filtering, map legacy values to new options, and set empty legacy categories to NULL.

ALTER TABLE equipment
  ALTER COLUMN categories DROP NOT NULL;

UPDATE equipment
SET categories = (
  SELECT array_agg(DISTINCT mapped ORDER BY mapped)
  FROM unnest(categories) AS raw(category)
  CROSS JOIN LATERAL (
    VALUES
      ('Primary', 'primary'),
      ('Primary', 'premium'),
      ('Specialty', 'specialty'),
      ('Specialty', 'inflatable'),
      ('GameTruck', 'gametruck'),
      ('GameTruck', 'game truck'),
      ('Lawn Games', 'lawn games'),
      ('Lawn Games', 'lawn game'),
      ('Add-Ons', 'add-ons'),
      ('Add-Ons', 'addons'),
      ('Add-Ons', 'add_ons'),
      ('Add-Ons', 'add on'),
      ('Add-Ons', 'add on')
  ) AS mapping(mapped, raw_value)
  WHERE lower(trim(category)) = raw_value
)
WHERE categories IS NOT NULL;

UPDATE equipment
SET categories = NULL
WHERE categories IS NOT NULL
  AND array_length(categories, 1) = 0;
