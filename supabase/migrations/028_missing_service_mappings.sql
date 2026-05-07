-- 028: Add missing service_mappings for the 2-Game Party Bundle and the
--      service-specific Generator add-on options across multiple services.
--      Also clean up legacy duplicate rows and add the unique-row guard.

-- ── 1. De-duplicate any pre-existing service_mappings rows ─────────────────
-- Keep one row per (service_id, modifier_id, item_id), preferring
-- use_customer_qty=true. Required before the unique index can be created.
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY zenbooker_service_id,
                        COALESCE(zenbooker_modifier_id, ''),
                        COALESCE(item_id, '')
           ORDER BY use_customer_qty DESC NULLS LAST, id ASC
         ) AS rn
  FROM service_mappings
)
DELETE FROM service_mappings
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- ── 2. Unique-row guard ────────────────────────────────────────────────────
-- Prevents future accidental duplicate (service, modifier, item) rows that
-- caused 4× / 2× double-counting before commit 88d690d.
CREATE UNIQUE INDEX IF NOT EXISTS service_mappings_unique
  ON service_mappings (
    zenbooker_service_id,
    COALESCE(zenbooker_modifier_id, ''),
    COALESCE(item_id, '')
  );

-- ── 3. Fix Giant Jenga mapping (separate equipment from Mega Jenga) ────────
-- Carried over from the previous fix in case the cleanup SQL was not run.
UPDATE service_mappings
SET item_id = 'jenga',
    zenbooker_modifier_name = 'Giant Jenga'
WHERE zenbooker_service_id = '1751332967401x820543194421858200'
  AND zenbooker_modifier_id = '1751332968147x265575809510310460'
  AND item_id = 'mega_jenga';

-- ── 4. 2-Game Party Bundle: simplify modifier_names so name-substring match
--      works on v1-import pricing_summary text ("[b]Laser Tag[/b] (10 blasters)").
--      The verbose "Game 1: Laser Tag" / "Game 2: Bubble Ball" labels were
--      not substrings of the parsed text.
UPDATE service_mappings
SET zenbooker_modifier_name = 'Laser Tag'
WHERE zenbooker_service_id  = '1771172713172x484717009863034240'
  AND zenbooker_modifier_id = '1771386092671x780499266784723000';

UPDATE service_mappings
SET zenbooker_modifier_name = 'Bubble Ball'
WHERE zenbooker_service_id  = '1771172713172x484717009863034240'
  AND zenbooker_modifier_id = '1771189658368x980867791971942400';

-- ── 5. 2-Game Party Bundle: add explicit is_skip rows so the meta-options
--      are documented (silent fall-through already produces the same outcome).
INSERT INTO service_mappings (
  id, zenbooker_service_id, zenbooker_service_name,
  zenbooker_modifier_id, zenbooker_modifier_name,
  item_id, default_qty, use_customer_qty, is_skip, notes
) VALUES
  (uuid_generate_v4(),
   '1771172713172x484717009863034240', '2-Game Party Bundle',
   '1771344276080x217614642235310080', 'Get a Custom Quote',
   NULL, 0, false, true,
   'meta-option (booking method) — no equipment'),
  (uuid_generate_v4(),
   '1771172713172x484717009863034240', '2-Game Party Bundle',
   '1771191124866x653745750691545100', '45 Minutes Per Game',
   NULL, 0, false, true,
   'meta-option (per-game duration) — no equipment')
ON CONFLICT DO NOTHING;

-- ── 6. Service-specific Generator add-on mappings ──────────────────────────
-- Each service that supports a Generator add-on has its OWN option ID for it.
-- Identified by scanning webhook_logs.raw_payload — these IDs were missing
-- from service_mappings and caused the "Generator" line to silently drop.
INSERT INTO service_mappings (
  id, zenbooker_service_id, zenbooker_service_name,
  zenbooker_modifier_id, zenbooker_modifier_name,
  item_id, default_qty, use_customer_qty, is_skip, notes
) VALUES
  -- Bubble Ball
  (uuid_generate_v4(),
   '1747439051481x330563883501879300', 'Bubble Ball',
   '1750734287992x844416159923306500', 'Generator',
   'generator', 1, true, false,
   'add-on: Generator (required if no power on site)'),
  -- Laser Tag
  (uuid_generate_v4(),
   '1747883952074x309158420488483400', 'Laser Tag',
   '1750740653415x754500715588878300', 'Generator',
   'generator', 1, true, false,
   'add-on: Generator (required if no outlet nearby)'),
  -- Hamster Ball Track / Human Hamster Balls
  (uuid_generate_v4(),
   '1749610846814x589129629020539440', 'Hamster Ball Track',
   '1749610848049x938323624452841200', 'Generator',
   'generator', 1, true, false,
   'add-on: Generator'),
  -- Arrow Tag
  (uuid_generate_v4(),
   '1749600355935x288401408375236200', 'Arrow Tag',
   '1749600357259x867965580911086200', 'Generator',
   'generator', 1, true, false,
   'add-on: Generator'),
  -- Big Bash Bundle
  (uuid_generate_v4(),
   '1771773473143x477742156759559900', 'Big Bash Bundle',
   '1771773475816x625168674684463100', 'Generator',
   'generator', 1, true, false,
   'add-on: Generator'),
  -- Add-Ons (standalone service with its own generator option)
  (uuid_generate_v4(),
   '1753235367762x610831773870850000', 'Add-Ons',
   '1776178198689x599642830681931800', 'Generator for Staffed Event',
   'generator', 1, true, false,
   'add-on: Generator for Staffed Event'),
  -- Party Pack Bundle
  (uuid_generate_v4(),
   '1771765253169x998239150834291000', 'Party Pack Bundle',
   '1771767111896x207313963177738240', 'Generator',
   'generator', 1, true, false,
   'add-on: Generator')
ON CONFLICT DO NOTHING;
