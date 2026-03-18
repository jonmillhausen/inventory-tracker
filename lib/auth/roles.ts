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
