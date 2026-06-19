'use client'

import { useState, useEffect, useCallback } from 'react'
import { getSupabase } from '@/lib/supabase'
import { PageShell, StatusBadge, PaymentBadge, formatDate, formatDateTime, formatXOF, daysUntil } from '@/lib/ui'

// ─── Revenue Bar Chart ───────────────────────────────────────
function RevenueChart({ schools }) {
  const [chartTier, setChartTier] = useState('all')

  const yearMap = {}
  schools.forEach(s => {
    if (chartTier !== 'all' && s.tier !== chartTier) return
    const year = s.created_at ? new Date(s.created_at).getFullYear() : null
    if (!year) return
    yearMap[year] = (yearMap[year] || 0) + (s.payment?.total_paid || 0)
  })

  const years = Object.keys(yearMap).sort()
  const maxVal = Math.max(...Object.values(yearMap), 1)

  return (
    <div className="bg-white rounded-xl border border-steel-200 p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-medium text-steel-700">Revenue par année</h2>
        <div className="flex gap-1">
          {['all', 'STANDARD', 'PRO'].map(t => (
            <button key={t} onClick={() => setChartTier(t)}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${chartTier === t ? 'bg-brand text-white' : 'text-steel-500 hover:bg-steel-100'}`}>
              {t === 'all' ? 'Tous' : t === 'STANDARD' ? 'Standard' : 'Pro'}
            </button>
          ))}
        </div>
      </div>
      {years.length === 0 ? (
        <div className="h-32 flex items-center justify-center">
          <p className="text-sm text-steel-400">Aucune donnée pour ce filtre</p>
        </div>
      ) : (
        <div className="flex items-end gap-4 h-32">
          {years.map(year => {
            const val = yearMap[year]
            const pct = (val / maxVal) * 100
            return (
              <div key={year} className="flex-1 flex flex-col items-center gap-1">
                <span className="text-xs text-steel-500">{formatXOF(val)}</span>
                <div className="w-full bg-steel-100 rounded-t relative" style={{ height: '100px' }}>
                  <div className="absolute bottom-0 w-full bg-brand rounded-t transition-all" style={{ height: `${pct}%` }} />
                </div>
                <span className="text-xs text-steel-600 font-medium">{year}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Dashboard ───────────────────────────────────────────────
export default function DashboardPage() {
  const [schools, setSchools] = useState([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('all')
  const [tierFilter, setTierFilter] = useState('all')
  const [sizeFilter, setSizeFilter] = useState('all')
  const [paymentFilter, setPaymentFilter] = useState('all')
  const [search, setSearch] = useState('')

  const fetchData = useCallback(async () => {
    const supabase = getSupabase()
    const { data } = await supabase.from('school_active_license').select('*').order('created_at', { ascending: false })
    let enriched = data || []

    const { data: payments } = await supabase.from('license_payment_summary').select('*')
    const payMap = {}
    ;(payments || []).forEach(p => { payMap[p.license_id] = p })
    enriched = enriched.map(s => ({ ...s, payment: payMap[s.id] || null }))

    setSchools(enriched)
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // Stats
  const total = schools.length
  const active = schools.filter(s => s.status === 'ACTIVE').length
  const totalRevenue = schools.reduce((sum, s) => sum + (s.payment?.total_paid || 0), 0)
  const totalUnpaid = schools.reduce((sum, s) => sum + Math.max(0, s.payment?.balance || 0), 0)
  const expiring = schools.filter(s => { const d = daysUntil(s.expiry_date); return d !== null && d <= 30 && d > 0 }).length
  const partialPay = schools.filter(s => s.payment?.payment_status === 'partial').length
  const suspended = schools.filter(s => s.status === 'SUSPENDED').length
  const pending = schools.filter(s => s.status === 'PENDING_ACTIVATION').length

  // Filters
  const filtered = schools.filter(s => {
    if (search) {
      const q = search.toLowerCase()
      if (!s.school_name?.toLowerCase().includes(q) && !s.school_code?.toLowerCase().includes(q) && !s.director_name?.toLowerCase().includes(q)) return false
    }
    if (statusFilter !== 'all') {
      if (statusFilter === 'expiring') { const d = daysUntil(s.expiry_date); if (d === null || d > 30 || d <= 0) return false }
      else if (s.status !== statusFilter) return false
    }
    if (tierFilter !== 'all' && s.tier !== tierFilter) return false
    if (sizeFilter !== 'all' && s.size !== sizeFilter) return false
    if (paymentFilter !== 'all' && s.payment?.payment_status !== paymentFilter) return false
    return true
  })

  async function quickToggle(school) {
    const supabase = getSupabase()
    const newStatus = school.status === 'SUSPENDED' ? 'ACTIVE' : 'SUSPENDED'
    await supabase.from('licenses').update({ status: newStatus, is_active: newStatus === 'ACTIVE' }).eq('id', school.id)
    fetchData()
  }

  function resetFilters() {
    setStatusFilter('all'); setTierFilter('all'); setSizeFilter('all'); setPaymentFilter('all'); setSearch('')
  }

  const hasFilters = statusFilter !== 'all' || tierFilter !== 'all' || sizeFilter !== 'all' || paymentFilter !== 'all' || search

  return (
    <PageShell>
      {/* Metric Cards */}
      <div className="grid grid-cols-4 gap-4 mb-4">
        {[
          { label: 'Total écoles', value: total, color: 'text-steel-900', filter: 'all' },
          { label: 'Actives cette année', value: active, color: 'text-brand', filter: 'ACTIVE' },
          { label: 'Revenue total', value: formatXOF(totalRevenue), color: 'text-brand', filter: null },
          { label: 'Impayés totaux', value: formatXOF(totalUnpaid), color: totalUnpaid > 0 ? 'text-red-500' : 'text-brand', filter: null },
        ].map(c => (
          <button key={c.label} onClick={() => c.filter !== null && setStatusFilter(statusFilter === c.filter ? 'all' : c.filter)} disabled={c.filter === null}
            className={`bg-white rounded-xl border p-4 text-left transition-colors ${statusFilter === c.filter ? 'border-brand ring-1 ring-brand' : 'border-steel-200 hover:border-steel-300'} ${c.filter === null ? 'cursor-default' : ''}`}>
            <p className="text-xs text-steel-500">{c.label}</p>
            <p className={`text-xl font-medium mt-1 ${c.color}`}>{c.value}</p>
          </button>
        ))}
      </div>

      {/* Alert Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Expirent ≤30j', value: expiring, color: 'text-yellow-600', bg: 'bg-yellow-50 border-yellow-200', filter: 'expiring' },
          { label: 'Paiement partiel', value: partialPay, color: 'text-yellow-600', bg: 'bg-yellow-50 border-yellow-200', pFilter: 'partial' },
          { label: 'Suspendues', value: suspended, color: 'text-red-600', bg: 'bg-red-50 border-red-200', filter: 'SUSPENDED' },
          { label: 'En attente', value: pending, color: 'text-steel-600', bg: 'bg-steel-50 border-steel-200', filter: 'PENDING_ACTIVATION' },
        ].map(c => (
          <button key={c.label} onClick={() => {
            if (c.pFilter) { setPaymentFilter(paymentFilter === c.pFilter ? 'all' : c.pFilter); setStatusFilter('all') }
            else { setStatusFilter(statusFilter === c.filter ? 'all' : c.filter); setPaymentFilter('all') }
          }}
            className={`rounded-xl border p-3 text-left transition-colors ${
              (statusFilter === c.filter || paymentFilter === c.pFilter) ? 'ring-1 ring-brand border-brand' : c.bg
            }`}>
            <p className="text-xs text-steel-500">{c.label}</p>
            <p className={`text-lg font-medium ${c.color}`}>{c.value}</p>
          </button>
        ))}
      </div>

      {/* Revenue Chart */}
      <RevenueChart schools={schools} />

      {/* Filters + Search */}
      <div className="flex gap-3 mb-4 flex-wrap items-center">
        <input type="text" placeholder="Rechercher..." value={search} onChange={e => setSearch(e.target.value)}
          className="px-3 py-2 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand w-64" />
        <select value={tierFilter} onChange={e => setTierFilter(e.target.value)}
          className="px-3 py-2 border border-steel-200 rounded-lg text-sm bg-white focus:outline-none focus:border-brand">
          <option value="all">Tous les plans</option><option value="STANDARD">Standard</option><option value="PRO">Pro</option>
        </select>
        <select value={sizeFilter} onChange={e => setSizeFilter(e.target.value)}
          className="px-3 py-2 border border-steel-200 rounded-lg text-sm bg-white focus:outline-none focus:border-brand">
          <option value="all">Toutes tailles</option><option value="SMALL">S</option><option value="MEDIUM">M</option><option value="LARGE">L</option>
        </select>
        <select value={paymentFilter} onChange={e => setPaymentFilter(e.target.value)}
          className="px-3 py-2 border border-steel-200 rounded-lg text-sm bg-white focus:outline-none focus:border-brand">
          <option value="all">Tous paiements</option><option value="paid">Payé</option><option value="partial">Partiel</option><option value="pending">Impayé</option>
        </select>
        {hasFilters && (
          <button onClick={resetFilters} className="text-xs text-steel-400 hover:text-steel-600">Réinitialiser</button>
        )}
      </div>

      {/* School Table */}
      <div className="bg-white rounded-xl border border-steel-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-steel-200 bg-steel-50">
              <th className="text-left px-4 py-3 text-steel-500 font-medium">École</th>
              <th className="text-left px-4 py-3 text-steel-500 font-medium">ID</th>
              <th className="text-left px-4 py-3 text-steel-500 font-medium">Plan</th>
              <th className="text-right px-4 py-3 text-steel-500 font-medium">Dû</th>
              <th className="text-right px-4 py-3 text-steel-500 font-medium">Payé</th>
              <th className="text-left px-4 py-3 text-steel-500 font-medium">Paiement</th>
              <th className="text-left px-4 py-3 text-steel-500 font-medium">Expiration</th>
              <th className="text-left px-4 py-3 text-steel-500 font-medium">Statut</th>
              <th className="text-left px-4 py-3 text-steel-500 font-medium">Dernière sync</th>
              <th className="text-left px-4 py-3 text-steel-500 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={10} className="px-4 py-12 text-center text-steel-400">Chargement...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={10} className="px-4 py-12 text-center text-steel-400">
                {schools.length === 0 ? 'Aucune école enregistrée' : 'Aucun résultat'}
              </td></tr>
            ) : filtered.map(s => {
              const ed = daysUntil(s.expiry_date)
              const showRenew = ed !== null && ed <= 30
              return (
                <tr key={s.id} className="border-b border-steel-100 hover:bg-steel-50 transition-colors">
                  <td className="px-4 py-3">
                    <p className="text-steel-800 font-medium">{s.school_name}</p>
                    <p className="text-xs text-steel-400">{s.director_name}</p>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-brand-600">{s.school_code}</td>
                  <td className="px-4 py-3">
                    <span className="text-steel-800">{s.tier}</span>
                    <span className="text-steel-400 text-xs ml-1">{s.size}</span>
                  </td>
                  <td className="px-4 py-3 text-right text-steel-700">{formatXOF(s.total_fee_due)}</td>
                  <td className="px-4 py-3 text-right text-steel-700">{formatXOF(s.payment?.total_paid || 0)}</td>
                  <td className="px-4 py-3">{s.payment && <PaymentBadge status={s.payment.payment_status} />}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs ${ed !== null && ed < 30 ? 'text-red-500 font-medium' : 'text-steel-600'}`}>
                      {formatDate(s.expiry_date)}
                    </span>
                  </td>
                  <td className="px-4 py-3"><StatusBadge status={s.status} /></td>
                  <td className="px-4 py-3 text-xs text-steel-500">{s.last_sync_at ? formatDateTime(s.last_sync_at) : '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <a href={`/schools/${s.school_id}`} className="text-xs text-brand hover:text-brand-600 font-medium">Voir</a>
                      <button onClick={() => quickToggle(s)} className={`text-xs font-medium ${s.status === 'SUSPENDED' ? 'text-brand hover:text-brand-600' : 'text-red-500 hover:text-red-600'}`}>
                        {s.status === 'SUSPENDED' ? 'Réactiver' : 'Suspendre'}
                      </button>
                      {showRenew && (
                        <a href={`/schools/${s.school_id}`} className="text-xs text-yellow-600 hover:text-yellow-700 font-medium">Renouveler</a>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </PageShell>
  )
}
