'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type Stage = 'verifying' | 'set-password' | 'success' | 'error'

export default function AuthConfirmPage() {
  const [stage, setStage] = useState<Stage>('verifying')
  const [error, setError] = useState<string | null>(null)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const supabase = createClient()

    // Supabase JS automatically detects and exchanges the #access_token hash
    // on page load. Listen for the resulting SIGNED_IN event.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        setStage('set-password')
      }
    })

    // Fallback: if no auth event fires within 5 seconds, show error
    const timeout = setTimeout(() => {
      setStage(prev => {
        if (prev === 'verifying') {
          setError('This link has expired or is invalid. Contact your admin to send a new one.')
          return 'error'
        }
        return prev
      })
    }, 5000)

    return () => {
      subscription.unsubscribe()
      clearTimeout(timeout)
    }
  }, [])

  async function handleSetPassword(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (password !== confirm) {
      setError('Passwords do not match')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }

    setLoading(true)
    const supabase = createClient()
    const { error: updateErr } = await supabase.auth.updateUser({ password })

    if (updateErr) {
      setError(updateErr.message)
      setLoading(false)
      return
    }

    setStage('success')
    setTimeout(() => { window.location.href = '/' }, 1500)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm space-y-6 p-8 bg-white rounded-lg shadow">
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-bold">Wonderfly Inventory</h1>
          <p className="text-gray-500 text-sm">Set your password to complete account setup</p>
        </div>

        {stage === 'verifying' && (
          <p className="text-center text-gray-500">Verifying your link…</p>
        )}

        {stage === 'error' && (
          <div className="space-y-3 text-center">
            <p className="text-red-600">{error}</p>
          </div>
        )}

        {stage === 'success' && (
          <p className="text-center text-green-600 font-medium">
            Password set! Redirecting to the app…
          </p>
        )}

        {stage === 'set-password' && (
          <form onSubmit={handleSetPassword} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">New Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoFocus
                autoComplete="new-password"
                minLength={8}
                placeholder="At least 8 characters"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm">Confirm Password</Label>
              <Input
                id="confirm"
                type="password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                required
                autoComplete="new-password"
                minLength={8}
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Setting password…' : 'Set Password'}
            </Button>
          </form>
        )}
      </div>
    </div>
  )
}
