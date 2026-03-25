import { NextRequest, NextResponse } from 'next/server'

// In-memory cache: key = "${from}::${to}::${date}::${time}" → minutes
const cache = new Map<string, number>()

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
    return NextResponse.json({ minutes: cached })
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY
  if (!apiKey) {
    cache.set(cacheKey, 30)
    return NextResponse.json({ minutes: 30 })
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

    const url =
      `https://maps.googleapis.com/maps/api/distancematrix/json` +
      `?origins=${encodeURIComponent(from)}` +
      `&destinations=${encodeURIComponent(to)}` +
      `&mode=driving` +
      `&units=imperial` +
      departurePart +
      `&key=${apiKey}`

    const res = await fetch(url)
    const data = await res.json()

    const element = data?.rows?.[0]?.elements?.[0]
    if (element?.status === 'OK') {
      // Prefer duration_in_traffic if available, fall back to duration
      const seconds: number = element.duration_in_traffic?.value ?? element.duration?.value ?? 1800
      const minutes = Math.ceil(seconds / 60)
      cache.set(cacheKey, minutes)
      return NextResponse.json({ minutes })
    }
  } catch {
    // fall through to default
  }

  // Default fallback: 30 minutes
  cache.set(cacheKey, 30)
  return NextResponse.json({ minutes: 30 })
}
