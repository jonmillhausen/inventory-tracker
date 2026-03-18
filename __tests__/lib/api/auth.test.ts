// These are unit tests for the role-checking logic only.
// They mock the Supabase client to avoid real network calls.

// We test the role-checking utility, not the full helper
// (the full helper requires Supabase which is hard to mock in unit tests).
// The helper's integration is verified by the API route tests.

jest.mock('next/server', () => ({
  NextResponse: {
    json: jest.fn(),
  },
}))

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(),
}))

import type { UserRole } from '@/lib/types/database.types'
import { roleAllows } from '@/lib/api/auth'

describe('roleAllows', () => {
  it('allows admin for admin-only routes', () => {
    expect(roleAllows('admin', ['admin'])).toBe(true)
  })

  it('rejects sales for admin-only routes', () => {
    expect(roleAllows('sales', ['admin'])).toBe(false)
  })

  it('allows admin and sales for write routes', () => {
    expect(roleAllows('admin', ['admin', 'sales'])).toBe(true)
    expect(roleAllows('sales', ['admin', 'sales'])).toBe(true)
  })

  it('rejects staff for write routes', () => {
    expect(roleAllows('staff', ['admin', 'sales'])).toBe(false)
  })

  it('allows admin/sales/staff for issue flag routes', () => {
    expect(roleAllows('admin', ['admin', 'sales', 'staff'])).toBe(true)
    expect(roleAllows('sales', ['admin', 'sales', 'staff'])).toBe(true)
    expect(roleAllows('staff', ['admin', 'sales', 'staff'])).toBe(true)
  })

  it('rejects readonly for issue flag routes', () => {
    expect(roleAllows('readonly', ['admin', 'sales', 'staff'])).toBe(false)
  })
})
