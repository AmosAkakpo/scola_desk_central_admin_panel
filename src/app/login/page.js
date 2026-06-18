'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabase } from '@/lib/supabase'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleLogin(e) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const supabase = getSupabase()
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })

    if (authError) {
      setError('Identifiants incorrects')
      setLoading(false)
      return
    }

    router.push('/')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-steel-900">
      <div className="w-full max-w-sm p-8">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-steel-900 border-2 border-steel-700 rounded-2xl flex items-center justify-center mb-4">
            <span className="text-brand text-3xl font-semibold">S</span>
          </div>
          <h1 className="text-xl font-medium text-steel-200">ScolaDesk</h1>
          <p className="text-steel-400 text-sm mt-1">Central admin panel</p>
        </div>

        {/* Form */}
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm text-steel-400 mb-1.5">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-3 py-2.5 bg-steel-800 border border-steel-700 rounded-lg text-steel-200 placeholder-steel-500 focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand text-sm"
              placeholder="admin@scoladesk.com"
            />
          </div>

          <div>
            <label className="block text-sm text-steel-400 mb-1.5">Mot de passe</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-3 py-2.5 bg-steel-800 border border-steel-700 rounded-lg text-steel-200 placeholder-steel-500 focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand text-sm"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p className="text-red-400 text-sm">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-brand hover:bg-brand-600 disabled:opacity-50 text-white font-medium rounded-lg text-sm transition-colors"
          >
            {loading ? 'Connexion...' : 'Se connecter'}
          </button>
        </form>
      </div>
    </div>
  )
}
