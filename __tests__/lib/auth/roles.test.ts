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
