'use client'

import { useState, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { getSupabase } from './supabase'

// ─── Auth Wrapper ────────────────────────────────────────────
export function AuthGuard({ children }) {
  const [ready, setReady] = useState(false)
  const router = useRouter()

  useEffect(() => {
    async function check() {
      const supabase = getSupabase()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }
      setReady(true)
    }
    check()
  }, [router])

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-steel-50">
        <div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return children
}

// ─── Sidebar ─────────────────────────────────────────────────
const NAV_ITEMS = [
  {
    href: '/', label: 'Écoles',
    icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4',
  },
  {
    href: '/schools/new', label: 'Nouvelle école',
    icon: 'M12 4v16m8-8H4',
  },
  {
    href: '/pricing', label: 'Tarification',
    icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  },
]

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()

  async function handleLogout() {
    const supabase = getSupabase()
    await supabase.auth.signOut()
    router.push('/login')
  }

  function isActive(href) {
    if (href === '/') return pathname === '/'
    return pathname.startsWith(href)
  }

  return (
    <aside className="w-60 bg-steel-800 min-h-screen flex flex-col shrink-0">
      <div className="p-5 border-b border-steel-700">
        <div className="flex items-center gap-3">
          <img src="/favicon-32x32.png" alt="ScolaDesk" className="w-9 h-9 rounded-xl" />
          <div>
            <p className="text-steel-200 font-medium text-sm">ScolaDesk</p>
            <p className="text-steel-500 text-xs">Central admin</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-3 space-y-1">
        {NAV_ITEMS.map(item => (
          <a
            key={item.href}
            href={item.href}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
              isActive(item.href)
                ? 'bg-steel-700/50 text-steel-200'
                : 'text-steel-400 hover:text-steel-200 hover:bg-steel-700/50'
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.icon} />
            </svg>
            {item.label}
          </a>
        ))}
      </nav>

      <div className="p-3 border-t border-steel-700">
        <button onClick={handleLogout} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-steel-400 hover:text-steel-200 hover:bg-steel-700/50 text-sm w-full transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          Déconnexion
        </button>
      </div>
    </aside>
  )
}

// ─── Page Shell ──────────────────────────────────────────────
export function PageShell({ children }) {
  return (
    <AuthGuard>
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <main className="flex-1 p-8 overflow-y-auto">{children}</main>
      </div>
    </AuthGuard>
  )
}

// ─── Status Badges ───────────────────────────────────────────
const STATUS_MAP = {
  PENDING_ACTIVATION: { label: 'En attente', cls: 'bg-yellow-100 text-yellow-800' },
  ACTIVE:             { label: 'Actif', cls: 'bg-brand-50 text-brand-600' },
  SUSPENDED:          { label: 'Suspendu', cls: 'bg-red-100 text-red-800' },
  REVOKED:            { label: 'Révoqué', cls: 'bg-steel-200 text-steel-600' },
}

export function StatusBadge({ status }) {
  const s = STATUS_MAP[status] || { label: status, cls: 'bg-steel-100 text-steel-500' }
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${s.cls}`}>{s.label}</span>
}

const PAYMENT_MAP = {
  paid:    { label: 'Payé', cls: 'bg-brand-50 text-brand-600' },
  partial: { label: 'Partiel', cls: 'bg-yellow-100 text-yellow-800' },
  pending: { label: 'Impayé', cls: 'bg-red-100 text-red-700' },
}

export function PaymentBadge({ status }) {
  const s = PAYMENT_MAP[status] || { label: status, cls: 'bg-steel-100 text-steel-500' }
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${s.cls}`}>{s.label}</span>
}

// ─── Formatters ──────────────────────────────────────────────
export function formatDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function formatDateTime(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function formatXOF(amount) {
  if (amount === null || amount === undefined) return '—'
  return Number(amount).toLocaleString('fr-FR') + ' XOF'
}

export function daysUntil(dateStr) {
  if (!dateStr) return null
  return Math.ceil((new Date(dateStr) - new Date()) / (1000 * 60 * 60 * 24))
}

// Default license period: Aug 1 -> Jul 31 (owner-set 2026-07-13), matching
// the local app's school-year convention. Computed client-side (no RPC
// round-trip) so the date fields can be pre-filled AND immediately
// editable in the form -- staff override either date before submitting.
export function defaultLicensePeriod() {
  const now = new Date()
  const year = now.getMonth() + 1 >= 8 ? now.getFullYear() : now.getFullYear() - 1
  return {
    period_start: `${year}-08-01`,
    expiry_date: `${year + 1}-07-31`,
  }
}
