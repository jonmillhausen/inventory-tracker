# Wonderfly Inventory — Plan 1: Foundation

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Next.js 14 + Supabase foundation: project scaffold, database schema, auth middleware, and dashboard layout with role-aware sidebar.

**Architecture:** Next.js 14 App Router (TypeScript). Supabase handles auth (JWT) and PostgreSQL. `middleware.ts` guards all dashboard routes by checking the Supabase session. The dashboard layout wraps all tabs with a role-aware sidebar and TanStack Query provider. Server Components fetch initial data; Client Components handle interaction.

**Tech Stack:** Next.js 14, TypeScript, Tailwind CSS, shadcn/ui, TanStack Query v5, Supabase (`@supabase/ssr`), Jest + React Testing Library

**This is Plan 1 of 4.** Subsequent plans (Equipment Module, Bookings & Schedule, Webhook & Settings) depend on this foundation being in place first.

---

## File Map

### New files created in this plan

```
middleware.ts                               Auth guard — redirects unauthenticated requests to /login
app/
  layout.tsx                               Root HTML shell
  login/
    page.tsx                               Email/password login form (Client Component)
  (dashboard)/
    layout.tsx                             Dashboard shell: sidebar + topbar + QueryProvider (Server Component)
    page.tsx                               Redirects to /availability
    availability/page.tsx                  Placeholder tab
    schedule/page.tsx                      Placeholder tab
    bookings/page.tsx                      Placeholder tab
    chains/page.tsx                        Placeholder tab
    equipment/page.tsx                     Placeholder tab
    settings/
      page.tsx                             Admin guard + redirect to /settings/mappings/service
      mappings/service/page.tsx            Placeholder
      mappings/chain/page.tsx              Placeholder
      equipment/page.tsx                   Placeholder
      users/page.tsx                       Placeholder
      webhook-logs/page.tsx                Placeholder
components/
  providers/
    QueryProvider.tsx                      TanStack Query client provider (Client Component)
  layout/
    Sidebar.tsx                            Role-aware nav sidebar (Client Component)
    TopBar.tsx                             User info + sign-out (Client Component)
lib/
  supabase/
    client.ts                              Browser-side Supabase client
    server.ts                              Server-side Supabase client (reads cookies)
    middleware.ts                          Session refresh helper used by middleware.ts
  types/
    database.types.ts                      TypeScript types for all DB tables and enums
  auth/
    roles.ts                               Role checking utilities (canWrite, canAdmin, etc.)
supabase/
  migrations/
    001_initial_schema.sql                 Full schema: enums, tables, triggers, RLS, Realtime
__tests__/
  lib/auth/
    roles.test.ts                          Unit tests for role utilities
  components/
    Sidebar.test.tsx                       Component tests for nav item visibility per role
jest.config.ts
jest.setup.ts
```

---

## Tasks

### Task 1: Scaffold the Next.js Project

**Files:**
- Create: project root (all scaffold-generated files)
- Create: `jest.config.ts`
- Create: `jest.setup.ts`

- [ ] **Step 1: Create the project**

Run from the parent directory (`/Users/jonmillhausen`). The project directory `inventory_tracker` already exists with a spec file — scaffold **into** it:

```bash
cd /Users/jonmillhausen
npx create-next-app@latest inventory_tracker --typescript --tailwind --eslint --app --src-dir=no --import-alias="@/*"
```

When prompted about the existing directory, confirm you want to proceed. Say yes to all defaults.

- [ ] **Step 2: Verify the scaffold**

```bash
cd /Users/jonmillhausen/inventory_tracker
ls
```

Expected: `app/`, `components/`, `lib/`, `public/`, `package.json`, `next.config.ts`, `tailwind.config.ts`, `tsconfig.json`

- [ ] **Step 3: Install core runtime dependencies**

```bash
npm install @supabase/supabase-js @supabase/ssr @tanstack/react-query @tanstack/react-query-devtools
```

- [ ] **Step 4: Initialize shadcn/ui**

```bash
npx shadcn@latest init
```

When prompted: select **New York** style, **Zinc** base color, **yes** to CSS variables. Accept all other defaults.

- [ ] **Step 5: Add the shadcn/ui components used in this project**

```bash
npx shadcn@latest add button input label badge dialog select table sheet popover
```

- [ ] **Step 6: Install testing dependencies**

```bash
npm install --save-dev jest @types/jest jest-environment-jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event
```

- [ ] **Step 7: Create `jest.config.ts`**

```typescript
import type { Config } from 'jest'
import nextJest from 'next/jest.js'

const createJestConfig = nextJest({ dir: './' })

const config: Config = {
  coverageProvider: 'v8',
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
}

export default createJestConfig(config)
```

- [ ] **Step 8: Create `jest.setup.ts`**

```typescript
import '@testing-library/jest-dom'
```

- [ ] **Step 9: Add test script to `package.json`**

In `package.json`, add to the `"scripts"` object:

```json
"test": "jest"
```

- [ ] **Step 10: Verify the dev server starts**

```bash
npm run dev
```

Expected: Server starts on http://localhost:3000 without errors. Stop with Ctrl+C.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat: scaffold Next.js 14 project with Supabase, shadcn/ui, and Jest"
```

---

### Task 2: Supabase Client Setup

**Files:**
- Create: `lib/supabase/client.ts`
- Create: `lib/supabase/server.ts`
- Create: `lib/supabase/middleware.ts`
- Create: `.env.local`

**Prerequisite:** Create a Supabase project at https://supabase.com. Copy the Project URL, anon key, and service role key from **Settings → API**.

- [ ] **Step 1: Create `.env.local`**

Create the file `/Users/jonmillhausen/inventory_tracker/.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
WEBHOOK_SECRET=generate-a-random-32-char-hex-string
PACKING_LIST_HMAC_SECRET=generate-a-random-different-32-char-hex-string
```

Replace placeholder values with actual Supabase credentials.

Generate random secrets with:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

- [ ] **Step 2: Verify `.env.local` is in `.gitignore`**

```bash
grep ".env.local" .gitignore
```

Expected: `.env.local` appears in the output. If not, add it:
```bash
echo ".env.local" >> .gitignore
```

- [ ] **Step 3: Create the browser Supabase client**

Create `lib/supabase/client.ts`:

```typescript
import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/lib/types/database.types'

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

- [ ] **Step 4: Create the server Supabase client**

Create `lib/supabase/server.ts`:

```typescript
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from '@/lib/types/database.types'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Called from a Server Component — cookies set in middleware instead
          }
        },
      },
    }
  )
}
```

- [ ] **Step 5: Create the Supabase middleware helper**

Create `lib/supabase/middleware.ts`:

```typescript
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import type { Database } from '@/lib/types/database.types'

// Public paths that don't require authentication
const PUBLIC_PATHS = ['/login', '/api/webhooks', '/api/packing-list']

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
          // Only write to supabaseResponse — do NOT touch request.cookies here
          // and do NOT recreate supabaseResponse, as that drops prior response headers.
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
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
```

- [ ] **Step 6: Commit**

```bash
git add lib/supabase/ .gitignore
git commit -m "feat: add Supabase client setup (browser, server, middleware helper)"
```

---

### Task 3: TypeScript Database Types

**Files:**
- Create: `lib/types/database.types.ts`

- [ ] **Step 1: Create the database types file**

Create `lib/types/database.types.ts`:

```typescript
export type UserRole = 'admin' | 'sales' | 'staff' | 'readonly'
export type BookingStatus = 'confirmed' | 'canceled' | 'completed' | 'needs_review'
export type EventType = 'coordinated' | 'dropoff' | 'pickup' | 'willcall'
export type BookingSource = 'webhook' | 'manual'
export type ItemType = 'equipment' | 'sub_item'
export type ResolvedAction = 'cleared' | 'moved_to_oos'
export type WebhookResult = 'success' | 'error' | 'unmapped_service' | 'skipped'

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string
          full_name: string
          role: UserRole
          created_at: string
        }
        Insert: {
          id: string
          full_name: string
          role: UserRole
        }
        Update: Partial<{ full_name: string; role: UserRole }>
      }
      equipment: {
        Row: {
          id: string
          name: string
          total_qty: number
          out_of_service: number
          issue_flag: number
          is_active: boolean
          custom_setup_min: number | null
          custom_cleanup_min: number | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          name: string
          total_qty: number
          is_active?: boolean
          custom_setup_min?: number | null
          custom_cleanup_min?: number | null
        }
        Update: Partial<{
          name: string
          total_qty: number
          is_active: boolean
          custom_setup_min: number | null
          custom_cleanup_min: number | null
        }>
      }
      equipment_sub_items: {
        Row: {
          id: string
          parent_id: string
          name: string
          total_qty: number
          out_of_service: number
          issue_flag: number
          is_active: boolean
        }
        Insert: {
          id: string
          parent_id: string
          name: string
          total_qty: number
          is_active?: boolean
        }
        Update: Partial<{ name: string; total_qty: number; is_active: boolean }>
      }
      issue_flag_items: {
        Row: {
          id: string
          item_id: string
          item_type: ItemType
          qty: number
          note: string
          reported_at: string
          resolved_at: string | null
          resolved_action: ResolvedAction | null
        }
        Insert: {
          item_id: string
          item_type: ItemType
          qty: number
          note: string
          resolved_at?: string | null
          resolved_action?: ResolvedAction | null
        }
        Update: Partial<{
          resolved_at: string | null
          resolved_action: ResolvedAction | null
        }>
      }
      out_of_service_items: {
        Row: {
          id: string
          item_id: string
          item_type: ItemType
          qty: number
          note: string
          return_date: string | null
          created_at: string
          returned_at: string | null
        }
        Insert: {
          item_id: string
          item_type: ItemType
          qty: number
          note: string
          return_date?: string | null
          returned_at?: string | null
        }
        Update: Partial<{ return_date: string | null; returned_at: string | null }>
      }
      bookings: {
        Row: {
          id: string
          zenbooker_job_id: string
          customer_name: string
          event_date: string
          end_date: string | null
          start_time: string
          end_time: string
          chain: string | null
          status: BookingStatus
          event_type: EventType
          source: BookingSource
          address: string
          notes: string
          created_at: string
          updated_at: string
        }
        Insert: {
          zenbooker_job_id: string
          customer_name: string
          event_date: string
          end_date?: string | null
          start_time: string
          end_time: string
          chain?: string | null
          status: BookingStatus
          event_type: EventType
          source: BookingSource
          address: string
          notes: string
        }
        Update: Partial<{
          customer_name: string
          event_date: string
          end_date: string | null
          start_time: string
          end_time: string
          chain: string | null
          status: BookingStatus
          event_type: EventType
          address: string
          notes: string
        }>
      }
      booking_items: {
        Row: {
          id: string
          booking_id: string
          item_id: string
          qty: number
          is_sub_item: boolean
          parent_item_id: string | null
        }
        Insert: {
          booking_id: string
          item_id: string
          qty: number
          is_sub_item: boolean
          parent_item_id?: string | null
        }
        Update: Partial<{ qty: number }>
      }
      chains: {
        Row: {
          id: string
          name: string
          color: string
          is_active: boolean
        }
        Insert: {
          id: string
          name: string
          color: string
          is_active?: boolean
        }
        Update: Partial<{ name: string; color: string; is_active: boolean }>
      }
      chain_mappings: {
        Row: {
          id: string
          zenbooker_staff_id: string
          zenbooker_staff_name: string
          chain_id: string
          notes: string
        }
        Insert: {
          zenbooker_staff_id: string
          zenbooker_staff_name: string
          chain_id: string
          notes: string
        }
        Update: Partial<{
          zenbooker_staff_name: string
          chain_id: string
          notes: string
        }>
      }
      service_mappings: {
        Row: {
          id: string
          zenbooker_service_id: string
          zenbooker_service_name: string
          zenbooker_modifier_id: string | null
          zenbooker_modifier_name: string | null
          item_id: string
          default_qty: number
          use_customer_qty: boolean
          notes: string
        }
        Insert: {
          zenbooker_service_id: string
          zenbooker_service_name: string
          zenbooker_modifier_id?: string | null
          zenbooker_modifier_name?: string | null
          item_id: string
          default_qty: number
          use_customer_qty: boolean
          notes: string
        }
        Update: Partial<{
          zenbooker_service_name: string
          zenbooker_modifier_name: string | null
          item_id: string
          default_qty: number
          use_customer_qty: boolean
          notes: string
        }>
      }
      webhook_logs: {
        Row: {
          id: string
          received_at: string
          zenbooker_job_id: string
          action: string
          raw_payload: Record<string, unknown>
          result: WebhookResult | null
          result_detail: string | null
          booking_id: string | null
        }
        Insert: {
          received_at: string
          zenbooker_job_id: string
          action: string
          raw_payload: Record<string, unknown>
          result?: WebhookResult | null
          result_detail?: string | null
          booking_id?: string | null
        }
        Update: Partial<{
          result: WebhookResult | null
          result_detail: string | null
          booking_id: string | null
        }>
      }
    }
    Enums: {
      user_role: UserRole
      booking_status: BookingStatus
      event_type: EventType
      booking_source: BookingSource
      item_type: ItemType
      resolved_action: ResolvedAction
      webhook_result: WebhookResult
    }
  }
}
```

- [ ] **Step 2: Run type check**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add lib/types/
git commit -m "feat: add TypeScript database types for all Supabase tables"
```

---

### Task 4: Auth Role Utilities (TDD)

**Files:**
- Create: `lib/auth/roles.ts`
- Create: `__tests__/lib/auth/roles.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `__tests__/lib/auth/roles.test.ts`:

```typescript
import { canWrite, canAdmin, canAssignChain, canCheckPackingList, canCreateIssueFlag } from '@/lib/auth/roles'

describe('canWrite', () => {
  it('returns true for admin', () => expect(canWrite('admin')).toBe(true))
  it('returns true for sales', () => expect(canWrite('sales')).toBe(true))
  it('returns false for staff', () => expect(canWrite('staff')).toBe(false))
  it('returns false for readonly', () => expect(canWrite('readonly')).toBe(false))
})

describe('canAdmin', () => {
  it('returns true for admin', () => expect(canAdmin('admin')).toBe(true))
  it('returns false for sales', () => expect(canAdmin('sales')).toBe(false))
  it('returns false for staff', () => expect(canAdmin('staff')).toBe(false))
  it('returns false for readonly', () => expect(canAdmin('readonly')).toBe(false))
})

describe('canAssignChain', () => {
  it('returns true for admin', () => expect(canAssignChain('admin')).toBe(true))
  it('returns true for sales', () => expect(canAssignChain('sales')).toBe(true))
  it('returns true for staff', () => expect(canAssignChain('staff')).toBe(true))
  it('returns false for readonly', () => expect(canAssignChain('readonly')).toBe(false))
})

describe('canCheckPackingList', () => {
  it('returns true for admin', () => expect(canCheckPackingList('admin')).toBe(true))
  it('returns true for sales', () => expect(canCheckPackingList('sales')).toBe(true))
  it('returns true for staff', () => expect(canCheckPackingList('staff')).toBe(true))
  it('returns false for readonly', () => expect(canCheckPackingList('readonly')).toBe(false))
})

describe('canCreateIssueFlag', () => {
  it('returns true for admin', () => expect(canCreateIssueFlag('admin')).toBe(true))
  it('returns true for sales', () => expect(canCreateIssueFlag('sales')).toBe(true))
  it('returns true for staff', () => expect(canCreateIssueFlag('staff')).toBe(true))
  it('returns false for readonly', () => expect(canCreateIssueFlag('readonly')).toBe(false))
})
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npm test -- __tests__/lib/auth/roles.test.ts --no-coverage
```

Expected: FAIL — `Cannot find module '@/lib/auth/roles'`

- [ ] **Step 3: Implement role utilities**

Create `lib/auth/roles.ts`:

```typescript
import type { UserRole } from '@/lib/types/database.types'

export function canWrite(role: UserRole): boolean {
  return role === 'admin' || role === 'sales'
}

export function canAdmin(role: UserRole): boolean {
  return role === 'admin'
}

export function canAssignChain(role: UserRole): boolean {
  return role === 'admin' || role === 'sales' || role === 'staff'
}

export function canCheckPackingList(role: UserRole): boolean {
  return role === 'admin' || role === 'sales' || role === 'staff'
}

export function canCreateIssueFlag(role: UserRole): boolean {
  return role === 'admin' || role === 'sales' || role === 'staff'
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
npm test -- __tests__/lib/auth/roles.test.ts --no-coverage
```

Expected: PASS — 20 tests

- [ ] **Step 5: Commit**

```bash
git add lib/auth/ __tests__/lib/auth/
git commit -m "feat: add role checking utilities with tests"
```

---

### Task 5: Auth Middleware

**Files:**
- Create: `middleware.ts`

- [ ] **Step 1: Create `middleware.ts`**

```typescript
import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function middleware(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico and other static assets
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
```

- [ ] **Step 2: Run type check**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add middleware.ts
git commit -m "feat: add Supabase auth middleware — redirects unauthenticated to /login"
```

---

### Task 6: Root Layout and Login Page

**Files:**
- Modify: `app/layout.tsx`
- Create: `app/login/page.tsx`

- [ ] **Step 1: Update root layout**

Replace the contents of `app/layout.tsx`:

```typescript
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Wonderfly Inventory',
  description: 'Wonderfly Equipment Inventory Management',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>{children}</body>
    </html>
  )
}
```

- [ ] **Step 2: Create login page**

Create `app/login/page.tsx`:

```typescript
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    router.push('/availability')
    router.refresh()
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm space-y-6 p-8 bg-white rounded-lg shadow">
        <h1 className="text-2xl font-bold text-center">Wonderfly Inventory</h1>
        <form onSubmit={handleLogin} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add app/layout.tsx app/login/
git commit -m "feat: add root layout and email/password login page"
```

---

### Task 7: Sidebar Component (TDD)

**Files:**
- Create: `components/layout/Sidebar.tsx`
- Create: `__tests__/components/Sidebar.test.tsx`

- [ ] **Step 1: Write failing Sidebar tests**

Create `__tests__/components/Sidebar.test.tsx`:

```typescript
import { render, screen } from '@testing-library/react'
import { Sidebar } from '@/components/layout/Sidebar'

// Mock Next.js navigation hooks
jest.mock('next/navigation', () => ({
  usePathname: () => '/availability',
}))

const TABS = ['Availability', 'Schedule', 'Bookings', 'Chain Loading', 'Equipment']

describe('Sidebar — admin', () => {
  beforeEach(() => render(<Sidebar role="admin" />))

  it.each(TABS)('shows "%s" tab', (tab) => {
    expect(screen.getByText(tab)).toBeInTheDocument()
  })

  it('shows Settings link', () => {
    expect(screen.getByText('Settings')).toBeInTheDocument()
  })
})

describe('Sidebar — sales', () => {
  beforeEach(() => render(<Sidebar role="sales" />))

  it.each(TABS)('shows "%s" tab', (tab) => {
    expect(screen.getByText(tab)).toBeInTheDocument()
  })

  it('hides Settings link', () => {
    expect(screen.queryByText('Settings')).not.toBeInTheDocument()
  })
})

describe('Sidebar — staff', () => {
  beforeEach(() => render(<Sidebar role="staff" />))

  it.each(TABS)('shows "%s" tab', (tab) => {
    expect(screen.getByText(tab)).toBeInTheDocument()
  })

  it('hides Settings link', () => {
    expect(screen.queryByText('Settings')).not.toBeInTheDocument()
  })
})

describe('Sidebar — readonly', () => {
  beforeEach(() => render(<Sidebar role="readonly" />))

  it.each(TABS)('shows "%s" tab', (tab) => {
    expect(screen.getByText(tab)).toBeInTheDocument()
  })

  it('hides Settings link', () => {
    expect(screen.queryByText('Settings')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npm test -- __tests__/components/Sidebar.test.tsx --no-coverage
```

Expected: FAIL — `Cannot find module '@/components/layout/Sidebar'`

- [ ] **Step 3: Implement Sidebar**

Create `components/layout/Sidebar.tsx`:

```typescript
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { canAdmin } from '@/lib/auth/roles'
import type { UserRole } from '@/lib/types/database.types'

const NAV_ITEMS = [
  { label: 'Availability', href: '/availability' },
  { label: 'Schedule', href: '/schedule' },
  { label: 'Bookings', href: '/bookings' },
  { label: 'Chain Loading', href: '/chains' },
  { label: 'Equipment', href: '/equipment' },
] as const

interface SidebarProps {
  role: UserRole
}

export function Sidebar({ role }: SidebarProps) {
  const pathname = usePathname()

  function navClass(href: string) {
    return cn(
      'px-3 py-2 rounded-md text-sm font-medium transition-colors',
      pathname.startsWith(href)
        ? 'bg-gray-700 text-white'
        : 'text-gray-300 hover:bg-gray-700 hover:text-white'
    )
  }

  return (
    <nav className="flex flex-col w-56 shrink-0 h-full bg-gray-900 text-gray-100 p-4 gap-1">
      <div className="text-lg font-bold mb-6 px-2">Wonderfly</div>
      {NAV_ITEMS.map(({ label, href }) => (
        <Link key={href} href={href} className={navClass(href)}>
          {label}
        </Link>
      ))}
      {canAdmin(role) && (
        <Link href="/settings" className={cn(navClass('/settings'), 'mt-auto')}>
          Settings
        </Link>
      )}
    </nav>
  )
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
npm test -- __tests__/components/Sidebar.test.tsx --no-coverage
```

Expected: PASS — 24 tests

- [ ] **Step 5: Commit**

```bash
git add components/layout/Sidebar.tsx __tests__/components/Sidebar.test.tsx
git commit -m "feat: add role-aware Sidebar component with tests"
```

---

### Task 8: Dashboard Layout

**Files:**
- Create: `components/providers/QueryProvider.tsx`
- Create: `components/layout/TopBar.tsx`
- Create: `app/(dashboard)/layout.tsx`
- Create: `app/(dashboard)/page.tsx`

- [ ] **Step 1: Create QueryProvider**

Create `components/providers/QueryProvider.tsx`:

```typescript
'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { useState } from 'react'

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000, // 1 minute
          },
        },
      })
  )

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  )
}
```

- [ ] **Step 2: Create TopBar**

Create `components/layout/TopBar.tsx`:

```typescript
'use client'

import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'

interface TopBarProps {
  userName: string
}

export function TopBar({ userName }: TopBarProps) {
  const router = useRouter()

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <header className="h-12 shrink-0 border-b bg-white flex items-center justify-between px-4">
      <div />
      <div className="flex items-center gap-3">
        <span className="text-sm text-gray-600">{userName}</span>
        <Button variant="outline" size="sm" onClick={handleSignOut}>
          Sign out
        </Button>
      </div>
    </header>
  )
}
```

- [ ] **Step 3: Create dashboard layout**

Create `app/(dashboard)/layout.tsx`:

```typescript
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { QueryProvider } from '@/components/providers/QueryProvider'
import { Sidebar } from '@/components/layout/Sidebar'
import { TopBar } from '@/components/layout/TopBar'
import type { UserRole } from '@/lib/types/database.types'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('users')
    .select('full_name, role')
    .eq('id', user.id)
    .single()

  if (!profile) {
    // User authenticated but no profile row — sign out and redirect
    redirect('/login')
  }

  return (
    <QueryProvider>
      <div className="flex h-screen overflow-hidden">
        <Sidebar role={profile.role as UserRole} />
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
          <TopBar userName={profile.full_name} />
          <main className="flex-1 overflow-auto p-6">{children}</main>
        </div>
      </div>
    </QueryProvider>
  )
}
```

- [ ] **Step 4: Create dashboard index redirect**

Create `app/(dashboard)/page.tsx`:

```typescript
import { redirect } from 'next/navigation'

export default function DashboardPage() {
  redirect('/availability')
}
```

- [ ] **Step 5: Run type check**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add components/providers/ components/layout/TopBar.tsx app/\(dashboard\)/layout.tsx app/\(dashboard\)/page.tsx
git commit -m "feat: add dashboard layout with QueryProvider, Sidebar, and TopBar"
```

---

### Task 9: Placeholder Tab Pages

**Files:**
- Create: `app/(dashboard)/availability/page.tsx`
- Create: `app/(dashboard)/schedule/page.tsx`
- Create: `app/(dashboard)/bookings/page.tsx`
- Create: `app/(dashboard)/chains/page.tsx`
- Create: `app/(dashboard)/equipment/page.tsx`
- Create: `app/(dashboard)/settings/page.tsx`
- Create: `app/(dashboard)/settings/mappings/service/page.tsx`
- Create: `app/(dashboard)/settings/mappings/chain/page.tsx`
- Create: `app/(dashboard)/settings/equipment/page.tsx`
- Create: `app/(dashboard)/settings/users/page.tsx`
- Create: `app/(dashboard)/settings/webhook-logs/page.tsx`

- [ ] **Step 1: Create main tab placeholders**

Create `app/(dashboard)/availability/page.tsx`:
```typescript
export default function AvailabilityPage() {
  return <p className="text-gray-500">Availability — coming soon</p>
}
```

Create `app/(dashboard)/schedule/page.tsx`:
```typescript
export default function SchedulePage() {
  return <p className="text-gray-500">Schedule — coming soon</p>
}
```

Create `app/(dashboard)/bookings/page.tsx`:
```typescript
export default function BookingsPage() {
  return <p className="text-gray-500">Bookings — coming soon</p>
}
```

Create `app/(dashboard)/chains/page.tsx`:
```typescript
export default function ChainsPage() {
  return <p className="text-gray-500">Chain Loading — coming soon</p>
}
```

Create `app/(dashboard)/equipment/page.tsx`:
```typescript
export default function EquipmentPage() {
  return <p className="text-gray-500">Equipment — coming soon</p>
}
```

- [ ] **Step 2: Create settings pages with admin guard**

Create `app/(dashboard)/settings/page.tsx`:

```typescript
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { canAdmin } from '@/lib/auth/roles'

export default async function SettingsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || !canAdmin(profile.role)) {
    return (
      <div className="text-center py-16">
        <h2 className="text-xl font-semibold text-gray-700">Access Denied</h2>
        <p className="text-gray-500 mt-2">
          You don&apos;t have permission to access Settings.
        </p>
      </div>
    )
  }

  redirect('/settings/mappings/service')
}
```

Create `app/(dashboard)/settings/mappings/service/page.tsx`:
```typescript
export default function ServiceMappingsPage() {
  return <p className="text-gray-500">Service Mappings — coming soon</p>
}
```

Create `app/(dashboard)/settings/mappings/chain/page.tsx`:
```typescript
export default function ChainMappingsPage() {
  return <p className="text-gray-500">Chain Mappings — coming soon</p>
}
```

Create `app/(dashboard)/settings/equipment/page.tsx`:
```typescript
export default function SettingsEquipmentPage() {
  return <p className="text-gray-500">Equipment Settings — coming soon</p>
}
```

Create `app/(dashboard)/settings/users/page.tsx`:
```typescript
export default function UsersPage() {
  return <p className="text-gray-500">User Management — coming soon</p>
}
```

Create `app/(dashboard)/settings/webhook-logs/page.tsx`:
```typescript
export default function WebhookLogsPage() {
  return <p className="text-gray-500">Webhook Logs — coming soon</p>
}
```

- [ ] **Step 3: Run type check**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add app/\(dashboard\)/
git commit -m "feat: add placeholder pages for all dashboard tabs and settings"
```

---

### Task 10: Database Schema Migration

**Files:**
- Create: `supabase/migrations/001_initial_schema.sql`

- [ ] **Step 1: Create the migration file**

Create `supabase/migrations/001_initial_schema.sql`:

```sql
-- ===========================
-- EXTENSIONS
-- ===========================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ===========================
-- ENUMS
-- ===========================

CREATE TYPE user_role AS ENUM ('admin', 'sales', 'staff', 'readonly');
CREATE TYPE booking_status AS ENUM ('confirmed', 'canceled', 'completed', 'needs_review');
CREATE TYPE event_type AS ENUM ('coordinated', 'dropoff', 'pickup', 'willcall');
CREATE TYPE booking_source AS ENUM ('webhook', 'manual');
CREATE TYPE item_type AS ENUM ('equipment', 'sub_item');
CREATE TYPE resolved_action AS ENUM ('cleared', 'moved_to_oos');
CREATE TYPE webhook_result AS ENUM ('success', 'error', 'unmapped_service', 'skipped');

-- ===========================
-- TABLES
-- ===========================

-- Users (extends Supabase auth.users)
CREATE TABLE users (
  id         uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name  text        NOT NULL,
  role       user_role   NOT NULL DEFAULT 'readonly',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Equipment items
CREATE TABLE equipment (
  id                 text        PRIMARY KEY,
  name               text        NOT NULL,
  total_qty          int         NOT NULL DEFAULT 0,
  out_of_service     int         NOT NULL DEFAULT 0,  -- maintained by trigger
  issue_flag         int         NOT NULL DEFAULT 0,  -- maintained by trigger
  is_active          bool        NOT NULL DEFAULT true,
  custom_setup_min   int,
  custom_cleanup_min int,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

-- Equipment sub-items (e.g. "Foam Machine Supplies" under "Foam Machine")
CREATE TABLE equipment_sub_items (
  id             text  PRIMARY KEY,
  parent_id      text  NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
  name           text  NOT NULL,
  total_qty      int   NOT NULL DEFAULT 0,
  out_of_service int   NOT NULL DEFAULT 0,  -- maintained by trigger
  issue_flag     int   NOT NULL DEFAULT 0,  -- maintained by trigger
  is_active      bool  NOT NULL DEFAULT true
);

-- Issue flags (damaged / needs attention)
CREATE TABLE issue_flag_items (
  id              uuid          PRIMARY KEY DEFAULT uuid_generate_v4(),
  item_id         text          NOT NULL,
  item_type       item_type     NOT NULL,
  qty             int           NOT NULL DEFAULT 1,
  note            text          NOT NULL DEFAULT '',
  reported_at     timestamptz   NOT NULL DEFAULT now(),
  resolved_at     timestamptz,
  resolved_action resolved_action
);

-- Out-of-service tracking
CREATE TABLE out_of_service_items (
  id          uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  item_id     text        NOT NULL,
  item_type   item_type   NOT NULL,
  qty         int         NOT NULL DEFAULT 1,
  note        text        NOT NULL DEFAULT '',
  return_date date,
  created_at  timestamptz NOT NULL DEFAULT now(),
  returned_at timestamptz
);

-- Delivery chains (e.g. "Chain #1", "Chain #2")
CREATE TABLE chains (
  id        text  PRIMARY KEY,
  name      text  NOT NULL,
  color     text  NOT NULL DEFAULT '#6366f1',
  is_active bool  NOT NULL DEFAULT true
);

-- Bookings
CREATE TABLE bookings (
  id                uuid           PRIMARY KEY DEFAULT uuid_generate_v4(),
  zenbooker_job_id  text           NOT NULL,
  customer_name     text           NOT NULL DEFAULT '',
  event_date        date           NOT NULL,
  end_date          date,
  start_time        time           NOT NULL,
  end_time          time           NOT NULL,
  chain             text           REFERENCES chains(id) ON DELETE SET NULL,
  status            booking_status NOT NULL DEFAULT 'confirmed',
  event_type        event_type     NOT NULL DEFAULT 'coordinated',
  source            booking_source NOT NULL DEFAULT 'manual',
  address           text           NOT NULL DEFAULT '',
  notes             text           NOT NULL DEFAULT '',
  created_at        timestamptz    NOT NULL DEFAULT now(),
  updated_at        timestamptz    NOT NULL DEFAULT now(),
  CONSTRAINT bookings_zenbooker_job_id_unique UNIQUE (zenbooker_job_id)
);

-- Line items per booking
CREATE TABLE booking_items (
  id             uuid  PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id     uuid  NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  item_id        text  NOT NULL,
  qty            int   NOT NULL DEFAULT 1,
  is_sub_item    bool  NOT NULL DEFAULT false,
  parent_item_id text
);

-- Maps Zenbooker staff members to delivery chains
CREATE TABLE chain_mappings (
  id                    uuid  PRIMARY KEY DEFAULT uuid_generate_v4(),
  zenbooker_staff_id    text  NOT NULL,
  zenbooker_staff_name  text  NOT NULL DEFAULT '',
  chain_id              text  NOT NULL REFERENCES chains(id) ON DELETE CASCADE,
  notes                 text  NOT NULL DEFAULT ''
);

-- Maps Zenbooker services/modifiers to inventory items
CREATE TABLE service_mappings (
  id                      uuid  PRIMARY KEY DEFAULT uuid_generate_v4(),
  zenbooker_service_id    text  NOT NULL,
  zenbooker_service_name  text  NOT NULL DEFAULT '',
  zenbooker_modifier_id   text,
  zenbooker_modifier_name text,
  item_id                 text  NOT NULL REFERENCES equipment(id) ON DELETE RESTRICT,
  default_qty             int   NOT NULL DEFAULT 1,
  use_customer_qty        bool  NOT NULL DEFAULT false,
  notes                   text  NOT NULL DEFAULT '',
  -- Prevent duplicate standalone service rows (modifier_id IS NULL)
  -- Prevent duplicate bundle modifier rows (modifier_id IS NOT NULL)
  CONSTRAINT service_mappings_unique
    UNIQUE NULLS NOT DISTINCT (zenbooker_service_id, zenbooker_modifier_id)
);

-- Audit log of every incoming Zenbooker webhook call
CREATE TABLE webhook_logs (
  id               uuid           PRIMARY KEY DEFAULT uuid_generate_v4(),
  received_at      timestamptz    NOT NULL DEFAULT now(),
  zenbooker_job_id text           NOT NULL DEFAULT '',
  action           text           NOT NULL DEFAULT '',
  raw_payload      jsonb          NOT NULL DEFAULT '{}',
  result           webhook_result,
  result_detail    text,
  booking_id       uuid           REFERENCES bookings(id) ON DELETE SET NULL
);

-- ===========================
-- UPDATED_AT TRIGGERS
-- ===========================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER equipment_updated_at
  BEFORE UPDATE ON equipment
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER bookings_updated_at
  BEFORE UPDATE ON bookings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ===========================
-- ISSUE FLAG COUNT TRIGGER
-- Recalculates equipment.issue_flag or equipment_sub_items.issue_flag
-- after any INSERT/UPDATE/DELETE on issue_flag_items.
-- ===========================

CREATE OR REPLACE FUNCTION update_issue_flag_count()
RETURNS TRIGGER AS $$
DECLARE
  v_item_id   text;
  v_item_type item_type;
  v_count     int;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_item_id   := OLD.item_id;
    v_item_type := OLD.item_type;
  ELSE
    v_item_id   := NEW.item_id;
    v_item_type := NEW.item_type;
  END IF;

  SELECT COALESCE(SUM(qty), 0) INTO v_count
  FROM issue_flag_items
  WHERE item_id = v_item_id
    AND item_type = v_item_type
    AND resolved_at IS NULL;

  IF v_item_type = 'equipment' THEN
    UPDATE equipment SET issue_flag = v_count WHERE id = v_item_id;
  ELSE
    UPDATE equipment_sub_items SET issue_flag = v_count WHERE id = v_item_id;
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER issue_flag_items_count
  AFTER INSERT OR UPDATE OR DELETE ON issue_flag_items
  FOR EACH ROW EXECUTE FUNCTION update_issue_flag_count();

-- ===========================
-- OUT-OF-SERVICE COUNT TRIGGER
-- ===========================

CREATE OR REPLACE FUNCTION update_out_of_service_count()
RETURNS TRIGGER AS $$
DECLARE
  v_item_id   text;
  v_item_type item_type;
  v_count     int;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_item_id   := OLD.item_id;
    v_item_type := OLD.item_type;
  ELSE
    v_item_id   := NEW.item_id;
    v_item_type := NEW.item_type;
  END IF;

  SELECT COALESCE(SUM(qty), 0) INTO v_count
  FROM out_of_service_items
  WHERE item_id = v_item_id
    AND item_type = v_item_type
    AND returned_at IS NULL;

  IF v_item_type = 'equipment' THEN
    UPDATE equipment SET out_of_service = v_count WHERE id = v_item_id;
  ELSE
    UPDATE equipment_sub_items SET out_of_service = v_count WHERE id = v_item_id;
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER out_of_service_items_count
  AFTER INSERT OR UPDATE OR DELETE ON out_of_service_items
  FOR EACH ROW EXECUTE FUNCTION update_out_of_service_count();

-- ===========================
-- ROW LEVEL SECURITY
-- ===========================

-- Helper: fetch the authenticated user's role (cached per statement)
CREATE OR REPLACE FUNCTION get_my_role()
RETURNS user_role AS $$
  SELECT role FROM users WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Enable RLS on all tables
ALTER TABLE users               ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment           ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment_sub_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE issue_flag_items    ENABLE ROW LEVEL SECURITY;
ALTER TABLE out_of_service_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings            ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_items       ENABLE ROW LEVEL SECURITY;
ALTER TABLE chains              ENABLE ROW LEVEL SECURITY;
ALTER TABLE chain_mappings      ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_mappings    ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_logs        ENABLE ROW LEVEL SECURITY;

-- users: own row always; admin reads all
CREATE POLICY users_select ON users FOR SELECT
  USING (id = auth.uid() OR get_my_role() = 'admin');
CREATE POLICY users_insert ON users FOR INSERT
  WITH CHECK (get_my_role() = 'admin');
CREATE POLICY users_update ON users FOR UPDATE
  USING (get_my_role() = 'admin');
CREATE POLICY users_delete ON users FOR DELETE
  USING (get_my_role() = 'admin');

-- equipment: all authenticated can read; admin writes
CREATE POLICY equipment_select ON equipment FOR SELECT
  USING (auth.uid() IS NOT NULL);
CREATE POLICY equipment_insert ON equipment FOR INSERT
  WITH CHECK (get_my_role() = 'admin');
CREATE POLICY equipment_update ON equipment FOR UPDATE
  USING (get_my_role() = 'admin');
CREATE POLICY equipment_delete ON equipment FOR DELETE
  USING (get_my_role() = 'admin');

-- equipment_sub_items: same as equipment
CREATE POLICY sub_items_select ON equipment_sub_items FOR SELECT
  USING (auth.uid() IS NOT NULL);
CREATE POLICY sub_items_insert ON equipment_sub_items FOR INSERT
  WITH CHECK (get_my_role() = 'admin');
CREATE POLICY sub_items_update ON equipment_sub_items FOR UPDATE
  USING (get_my_role() = 'admin');
CREATE POLICY sub_items_delete ON equipment_sub_items FOR DELETE
  USING (get_my_role() = 'admin');

-- issue_flag_items: all authenticated can read (required for Realtime cross-session)
--   admin/sales/staff can create; admin/sales can update; admin can delete
CREATE POLICY issue_flags_select ON issue_flag_items FOR SELECT
  USING (auth.uid() IS NOT NULL);
CREATE POLICY issue_flags_insert ON issue_flag_items FOR INSERT
  WITH CHECK (get_my_role() IN ('admin', 'sales', 'staff'));
CREATE POLICY issue_flags_update ON issue_flag_items FOR UPDATE
  USING (get_my_role() IN ('admin', 'sales'));
CREATE POLICY issue_flags_delete ON issue_flag_items FOR DELETE
  USING (get_my_role() = 'admin');

-- out_of_service_items: all authenticated read; admin writes
CREATE POLICY oos_select ON out_of_service_items FOR SELECT
  USING (auth.uid() IS NOT NULL);
CREATE POLICY oos_insert ON out_of_service_items FOR INSERT
  WITH CHECK (get_my_role() = 'admin');
CREATE POLICY oos_update ON out_of_service_items FOR UPDATE
  USING (get_my_role() = 'admin');
CREATE POLICY oos_delete ON out_of_service_items FOR DELETE
  USING (get_my_role() = 'admin');

-- bookings: all authenticated read; admin/sales write
CREATE POLICY bookings_select ON bookings FOR SELECT
  USING (auth.uid() IS NOT NULL);
CREATE POLICY bookings_insert ON bookings FOR INSERT
  WITH CHECK (get_my_role() IN ('admin', 'sales'));
CREATE POLICY bookings_update ON bookings FOR UPDATE
  USING (get_my_role() IN ('admin', 'sales'));
CREATE POLICY bookings_delete ON bookings FOR DELETE
  USING (get_my_role() IN ('admin', 'sales'));

-- booking_items: same as bookings
CREATE POLICY booking_items_select ON booking_items FOR SELECT
  USING (auth.uid() IS NOT NULL);
CREATE POLICY booking_items_insert ON booking_items FOR INSERT
  WITH CHECK (get_my_role() IN ('admin', 'sales'));
CREATE POLICY booking_items_update ON booking_items FOR UPDATE
  USING (get_my_role() IN ('admin', 'sales'));
CREATE POLICY booking_items_delete ON booking_items FOR DELETE
  USING (get_my_role() IN ('admin', 'sales'));

-- chains: all authenticated read; admin writes
CREATE POLICY chains_select ON chains FOR SELECT
  USING (auth.uid() IS NOT NULL);
CREATE POLICY chains_insert ON chains FOR INSERT
  WITH CHECK (get_my_role() = 'admin');
CREATE POLICY chains_update ON chains FOR UPDATE
  USING (get_my_role() = 'admin');
CREATE POLICY chains_delete ON chains FOR DELETE
  USING (get_my_role() = 'admin');

-- chain_mappings: all authenticated read; admin writes
CREATE POLICY chain_mappings_select ON chain_mappings FOR SELECT
  USING (auth.uid() IS NOT NULL);
CREATE POLICY chain_mappings_insert ON chain_mappings FOR INSERT
  WITH CHECK (get_my_role() = 'admin');
CREATE POLICY chain_mappings_update ON chain_mappings FOR UPDATE
  USING (get_my_role() = 'admin');
CREATE POLICY chain_mappings_delete ON chain_mappings FOR DELETE
  USING (get_my_role() = 'admin');

-- service_mappings: all authenticated read; admin writes
CREATE POLICY service_mappings_select ON service_mappings FOR SELECT
  USING (auth.uid() IS NOT NULL);
CREATE POLICY service_mappings_insert ON service_mappings FOR INSERT
  WITH CHECK (get_my_role() = 'admin');
CREATE POLICY service_mappings_update ON service_mappings FOR UPDATE
  USING (get_my_role() = 'admin');
CREATE POLICY service_mappings_delete ON service_mappings FOR DELETE
  USING (get_my_role() = 'admin');

-- webhook_logs: admin reads; service role writes (API routes use service role key)
CREATE POLICY webhook_logs_select ON webhook_logs FOR SELECT
  USING (get_my_role() = 'admin');
-- INSERT/UPDATE handled by service role (bypasses RLS) in API routes

-- ===========================
-- REALTIME PUBLICATIONS
-- ===========================

ALTER PUBLICATION supabase_realtime ADD TABLE bookings;
ALTER PUBLICATION supabase_realtime ADD TABLE equipment;
ALTER PUBLICATION supabase_realtime ADD TABLE equipment_sub_items;
ALTER PUBLICATION supabase_realtime ADD TABLE service_mappings;
ALTER PUBLICATION supabase_realtime ADD TABLE issue_flag_items;
ALTER PUBLICATION supabase_realtime ADD TABLE out_of_service_items;
```

- [ ] **Step 2: Run the migration in Supabase**

> **Note:** The `UNIQUE NULLS NOT DISTINCT` syntax requires PostgreSQL 15+. All Supabase-hosted projects created after late 2023 run PG15 by default — this will work. Self-hosted Postgres 14 would need the two partial-index approach from the spec instead.

In the Supabase dashboard → **SQL Editor**, paste the contents of `supabase/migrations/001_initial_schema.sql` and click **Run**.

Verify: no errors. All tables, enums, triggers, and policies appear in the Supabase Table Editor.

- [ ] **Step 3: Seed the first admin user**

In Supabase dashboard → **Authentication → Users**, create a user with email + password.

Copy the UUID. Then run in SQL Editor:

```sql
INSERT INTO users (id, full_name, role)
VALUES ('<paste-uuid-here>', 'Admin User', 'admin');
```

- [ ] **Step 4: Commit the migration file**

```bash
git add supabase/
git commit -m "feat: add initial database schema — tables, enums, triggers, RLS, Realtime"
```

---

### Task 11: End-to-End Verification

- [ ] **Step 1: Run the full test suite**

```bash
npm test -- --no-coverage
```

Expected: All tests PASS (roles tests + Sidebar tests).

- [ ] **Step 2: Run TypeScript check**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Smoke test the running app**

```bash
npm run dev
```

Manual checks:
1. Visit http://localhost:3000 → redirects to `/login`
2. Log in with the admin user → redirects to `/availability`
3. Sidebar shows: Availability, Schedule, Bookings, Chain Loading, Equipment, **Settings**
4. Click **Settings** → shows settings page (or redirects to `/settings/mappings/service`)
5. Sign out → redirects to `/login`

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "chore: Plan 1 complete — foundation verified"
```

---

## What Comes Next

| Plan | Focus |
|---|---|
| Plan 2 | Equipment Module: Equipment CRUD, sub-items CRUD, issue flag workflow, OOS tracking, Availability tab with computed calculations |
| Plan 3 | Bookings & Schedule: Bookings list, booking form (create/edit/cancel), Schedule Board, Chains tab, packing list print route |
| Plan 4 | Webhook & Settings: Zenbooker webhook handler (full pipeline), service/chain mappings UI, user management, `needs_review` flow with batch re-process |
