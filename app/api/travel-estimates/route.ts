import { NextRequest, NextResponse } from 'next/server'

// In-memory cache: key = "${from}::${to}::${date}::${time}" → { minutes, has_toll }
const cache = new Map<string, { minutes: number; has_toll: boolean }>()

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  const date = searchParams.get('date') ?? ''
  const time = searchParams.get('time') ?? ''

  if (!from || !to) {
    return NextResponse.json({ error: 'from and to are required' }, { status: 400 })
  }

  const cacheKey = `${from}::${to}::${date}::${time}`
  const cached = cache.get(cacheKey)
  if (cached !== undefined) {
    return NextResponse.json(cached)
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY
  if (!apiKey) {
    cache.set(cacheKey, { minutes: 30, has_toll: false })
    return NextResponse.json({ minutes: 30, has_toll: false })
  }

  try {
    // Build departure_time: combine date + time into a Unix timestamp
    let departurePart = ''
    if (date && time) {
      const depDate = new Date(`${date}T${time}:00`)
      if (!isNaN(depDate.getTime())) {
        departurePart = `&departure_time=${Math.floor(depDate.getTime() / 1000)}`
      }
    }

    const baseParams =
      `?origins=${encodeURIComponent(from)}` +
      `&destinations=${encodeURIComponent(to)}` +
      `&mode=driving` +
      `&units=imperial` +
      departurePart +
      `&key=${apiKey}`

    const BASE = 'https://maps.googleapis.com/maps/api/distancematrix/json'

    // Make both calls in parallel: default routing (includes tolls) and toll-avoiding routing
    const [withTollsRes, avoidTollsRes] = await Promise.all([
      fetch(BASE + baseParams),
      fetch(BASE + baseParams + '&avoid=tolls'),
    ])
    const [withTollsData, avoidTollsData] = await Promise.all([
      withTollsRes.json(),
      avoidTollsRes.json(),
    ])

    const withEl = withTollsData?.rows?.[0]?.elements?.[0]
    const avoidEl = avoidTollsData?.rows?.[0]?.elements?.[0]

    if (withEl?.status === 'OK') {
      const withSecs: number = withEl.duration_in_traffic?.value ?? withEl.duration?.value ?? 1800
      const minutes = Math.ceil(withSecs / 60)

      // If toll-free route takes more than 60s longer, the preferred route uses a toll
      let has_toll = false
      if (avoidEl?.status === 'OK') {
        const avoidSecs: number = avoidEl.duration?.value ?? 1800
        has_toll = avoidSecs - withSecs > 60
      }

      cache.set(cacheKey, { minutes, has_toll })
      return NextResponse.json({ minutes, has_toll })
    }
  } catch {
    // fall through to default
  }

  cache.set(cacheKey, { minutes: 30, has_toll: false })
  return NextResponse.json({ minutes: 30, has_toll: false })
}
