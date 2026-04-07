import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import type { Database } from '@/lib/types/database.types'

// Public paths that don't require authentication
const PUBLIC_PATHS = ['/login', '/auth/confirm', '/api/webhooks', '/api/packing-list', '/report', '/api/reports']

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some(p => pathname.startsWith(p))
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          // Update request cookies so downstream getAll() sees the refreshed tokens
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          // Recreate supabaseResponse with the updated request so new cookies are forwarded
          supabaseResponse = NextResponse.next({ request })
          // Set on response so the browser receives refreshed tokens
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Refresh session — IMPORTANT: do not remove this call
  const { data: { user } } = await supabase.auth.getUser()

  if (!user && !isPublicPath(request.nextUrl.pathname)) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    // Copy any refreshed session cookies into the redirect response so tokens aren't lost
    const redirectResponse = NextResponse.redirect(url)
    supabaseResponse.cookies.getAll().forEach(cookie =>
      redirectResponse.cookies.set(cookie)
    )
    return redirectResponse
  }

  return supabaseResponse
}
