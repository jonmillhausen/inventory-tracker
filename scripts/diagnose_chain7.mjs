// Read-only diagnostic for "Chain #7 not appearing on Schedule".
// Run: node --env-file=.env.local scripts/diagnose_chain7.mjs
import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}
const db = createClient(url, key, { auth: { persistSession: false } })

function table(rows) {
  if (!rows || rows.length === 0) { console.log('  (none)'); return }
  for (const r of rows) console.log('  ' + JSON.stringify(r))
}

console.log('\n========== 1. ALL chains (id, name, color, is_active) ==========')
const { data: chains, error: chErr } = await db
  .from('chains').select('id, name, color, is_active').order('name')
if (chErr) console.error('  ERROR:', chErr.message)
table(chains)

// Identify anything that looks like "Chain #7" / 7
const seven = (chains ?? []).filter(c =>
  /(^|[^0-9])7([^0-9]|$)/.test(c.name) || /7/.test(c.id))
console.log('\n  -> rows matching "7":')
table(seven)

console.log('\n========== 2. Bookings grouped by chain value ==========')
const { data: bookings, error: bErr } = await db
  .from('bookings').select('chain')
if (bErr) console.error('  ERROR:', bErr.message)
const counts = {}
for (const b of bookings ?? []) {
  const k = b.chain === null ? '<null/unassigned>' : b.chain
  counts[k] = (counts[k] ?? 0) + 1
}
console.log('  chain value -> booking count:')
for (const [k, v] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
  // flag chain ids that don't exist in an ACTIVE chain row
  const activeIds = new Set((chains ?? []).filter(c => c.is_active).map(c => c.id))
  const orphan = k !== '<null/unassigned>' && !activeIds.has(k) ? '  <-- NOT an active chain (would vanish from Schedule)' : ''
  console.log(`    ${k}: ${v}${orphan}`)
}

console.log('\n========== 3. chain_mappings (Zenbooker staff -> chain_id) ==========')
const { data: maps, error: mErr } = await db
  .from('chain_mappings').select('zenbooker_staff_id, zenbooker_staff_name, chain_id').order('chain_id')
if (mErr) console.error('  ERROR:', mErr.message)
table(maps)
const mappedChainIds = new Set((maps ?? []).map(m => m.chain_id))
const allChainIds = new Set((chains ?? []).map(c => c.id))
console.log('\n  -> chain ids that have a chains row but NO staff mapping (webhook can never assign them):')
for (const id of allChainIds) if (!mappedChainIds.has(id)) console.log('    ' + id)
console.log('\n  -> chain_mappings pointing at a chain_id with NO chains row (FK should prevent this):')
for (const id of mappedChainIds) if (!allChainIds.has(id)) console.log('    ' + id)

console.log('\n========== SUMMARY ==========')
console.log('  total chains:', (chains ?? []).length, '| active:', (chains ?? []).filter(c => c.is_active).length)
console.log('  "7"-matching chain rows:', seven.length)
console.log('  total bookings:', (bookings ?? []).length, '| unassigned:', counts['<null/unassigned>'] ?? 0)
console.log('')
