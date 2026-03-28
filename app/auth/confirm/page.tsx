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

    async function handleToken() {
      // Case 1: Hash fragment (implicit flow — invite links)
      const hash = window.location.hash.substring(1)
      const hashParams = new URLSearchParams(hash)
      const access_token = hashParams.get('access_token')
      const refresh_token = hashParams.get('refresh_token')
      const hashError = hashParams.get('error')

      if (hashError) {
        setError(hashParams.get('error_description') ?? 'Link is invalid or expired.')
        setStage('error')
        return
      }

      if (access_token && refresh_token) {
        const { error } = await supabase.auth.setSession({ access_token, refresh_token })
        if (error) {
          setError(error.message)
          setStage('error')
        } else {
          setStage('set-password')
        }
        return
      }

      // Case 2: Query params (PKCE flow — password reset links)
      const params = new URLSearchParams(window.location.search)
      const token_hash = params.get('token_hash')
      const type = params.get('type') as 'invite' | 'recovery' | null

      if (token_hash && type) {
        const { error } = await supabase.auth.verifyOtp({ token_hash, type })
        if (error) {
          setError(error.message)
          setStage('error')
        } else {
          setStage('set-password')
        }
        return
      }

      // No token found
      setError('Invalid or missing link parameters. Please request a new link from your admin.')
      setStage('error')
    }

    handleToken()
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
