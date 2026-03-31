import { render, screen } from '@testing-library/react'
import { Sidebar } from '@/components/layout/Sidebar'

// Mock Next.js navigation hooks
jest.mock('next/navigation', () => ({
  usePathname: () => '/availability',
}))

const TABS = ['Availability', 'Schedule', 'Event Audit', 'Bookings', 'Chain Loading', 'Equipment']

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
