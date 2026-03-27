'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type Stage = 'verifying' | 'set-password' | 'success' | 'error'

function ConfirmForm() {
  const searchParams = useSearchParams()
  const [stage, setStage] = useState<Stage>('verifying')
  const [error, setError] = useState<string | null>(null)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const token_hash = searchParams.get('token_hash')
    const type = searchParams.get('type') as 'invite' | 'recovery' | null

    if (!token_hash || !type) {
      setError('Invalid or missing link parameters. Please request a new link from your admin.')
      setStage('error')
      return
    }

    const supabase = createClient()
    supabase.auth.verifyOtp({ token_hash, type })
      .then(({ error: otpErr }) => {
        if (otpErr) {
          setError(otpErr.message)
          setStage('error')
        } else {
          setStage('set-password')
        }
      })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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

  if (stage === 'verifying') {
    return <p className="text-center text-gray-500">Verifying your link…</p>
  }

  if (stage === 'error') {
    return (
      <div className="space-y-3 text-center">
        <p className="text-red-600">{error}</p>
        <p className="text-sm text-gray-500">
          This link may have expired or already been used. Contact your admin to send a new one.
        </p>
      </div>
    )
  }

  if (stage === 'success') {
    return (
      <p className="text-center text-green-600 font-medium">
        Password set! Redirecting to the app…
      </p>
    )
  }

  return (
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
  )
}

export default function AuthConfirmPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm space-y-6 p-8 bg-white rounded-lg shadow">
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-bold">Wonderfly Inventory</h1>
          <p className="text-gray-500 text-sm">Set your password to complete account setup</p>
        </div>
        <Suspense fallback={<p className="text-center text-gray-500">Loading…</p>}>
          <ConfirmForm />
        </Suspense>
      </div>
    </div>
  )
}
