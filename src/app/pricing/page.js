'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabase } from '@/lib/supabase'

const SIZE_LABELS = { S: 'Petite (S)', M: 'Moyenne (M)', L: 'Grande (L)' }
const TIER_LABELS = { STANDARD: 'Standard', PRO: 'Pro' }

// ─── Sidebar (shared layout — kept inline per architecture rules) ──
function Sidebar({ onLogout }) {
  return (
    <aside className="w-60 bg-steel-800 min-h-screen flex flex-col">
      <div className="p-5 border-b border-steel-700">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-steel-900 rounded-xl flex items-center justify-center">
            <span className="text-brand-200 text-lg font-semibold">S</span>
          </div>
          <div>
            <p className="text-steel-200 font-medium text-sm">ScolaDesk</p>
            <p className="text-steel-500 text-xs">Central admin</p>
          </div>
        </div>
      </div>
      <nav className="flex-1 p-3 space-y-1">
        <a href="/" className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-steel-400 hover:text-steel-200 hover:bg-steel-700/50 text-sm transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
          Écoles
        </a>
        <a href="/pricing" className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-steel-700/50 text-steel-200 text-sm">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Tarification
        </a>
      </nav>
      <div className="p-3 border-t border-steel-700">
        <button onClick={onLogout} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-steel-400 hover:text-steel-200 hover:bg-steel-700/50 text-sm w-full transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          Déconnexion
        </button>
      </div>
    </aside>
  )
}

// ─── Add Country Modal ───────────────────────────────────────
function AddCountryModal({ open, onClose, onCreated, existingCountries }) {
  const [country, setCountry] = useState('')
  const [countryCode, setCountryCode] = useState('')
  const [currency, setCurrency] = useState('XOF')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    const name = country.trim()
    const code = countryCode.trim().toUpperCase()
    if (!name || !code) return
    if (code.length !== 2) {
      setError('Le code pays doit contenir 2 lettres (ex: BJ, TG, CI)')
      return
    }
    if (existingCountries.includes(name)) {
      setError('Ce pays existe déjà')
      return
    }

    setSaving(true)
    setError('')
    const supabase = getSupabase()

    const rows = []
    for (const tier of ['STANDARD', 'PRO']) {
      for (const size of ['S', 'M', 'L']) {
        rows.push({ country: name, tier, size, setup_fee: 0, annual_fee: 0, currency: currency.trim() || 'XOF', country_code: code })
      }
    }

    const { error: insertErr } = await supabase.from('pricing_plans').insert(rows)
    if (insertErr) {
      setError('Erreur lors de la création')
      setSaving(false)
      return
    }

    setSaving(false)
    setCountry('')
    setCountryCode('')
    setCurrency('XOF')
    onCreated()
    onClose()
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm">
        <div className="p-6 border-b border-steel-200">
          <h2 className="text-lg font-medium text-steel-900">Ajouter un pays</h2>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm text-steel-600 mb-1">Nom du pays <span className="text-red-500">*</span></label>
            <input
              type="text" required value={country}
              onChange={(e) => setCountry(e.target.value)}
              className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand"
              placeholder="Ex: Togo, Côte d'Ivoire..."
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-steel-600 mb-1">Code pays <span className="text-red-500">*</span></label>
              <input
                type="text" required value={countryCode} maxLength={2}
                onChange={(e) => setCountryCode(e.target.value.toUpperCase())}
                className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand uppercase"
                placeholder="BJ, TG, CI..."
              />
            </div>
            <div>
              <label className="block text-sm text-steel-600 mb-1">Devise</label>
              <input
                type="text" value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand"
              />
            </div>
          </div>
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 border border-steel-200 text-steel-600 rounded-lg text-sm font-medium hover:bg-steel-50 transition-colors">
              Annuler
            </button>
            <button type="submit" disabled={saving} className="flex-1 py-2.5 bg-brand hover:bg-brand-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors">
              {saving ? 'Création...' : 'Ajouter'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Pricing Page ────────────────────────────────────────────
export default function PricingPage() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [plans, setPlans] = useState([])
  const [selectedCountry, setSelectedCountry] = useState('')
  const [editing, setEditing] = useState({})
  const [saving, setSaving] = useState(false)
  const [showAddCountry, setShowAddCountry] = useState(false)
  const router = useRouter()

  const fetchPlans = useCallback(async () => {
    const supabase = getSupabase()
    const { data } = await supabase
      .from('pricing_plans')
      .select('*')
      .eq('is_active', true)
      .order('country')
      .order('tier')
      .order('size')
    setPlans(data || [])
    if (!selectedCountry && data?.length > 0) {
      setSelectedCountry(data[0].country)
    }
  }, [selectedCountry])

  useEffect(() => {
    async function init() {
      const supabase = getSupabase()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }
      setUser(session.user)
      setLoading(false)
      fetchPlans()
    }
    init()
  }, [router, fetchPlans])

  async function handleLogout() {
    const supabase = getSupabase()
    await supabase.auth.signOut()
    router.push('/login')
  }

  const countries = [...new Set(plans.map(p => p.country))]
  const countryPlans = plans.filter(p => p.country === selectedCountry)
  const countryCurrency = countryPlans[0]?.currency || 'XOF'

  function startEditing() {
    const map = {}
    countryPlans.forEach(p => {
      map[p.id] = { setup_fee: p.setup_fee, annual_fee: p.annual_fee }
    })
    setEditing(map)
  }

  function updateField(id, field, value) {
    const num = parseInt(value) || 0
    setEditing(prev => ({ ...prev, [id]: { ...prev[id], [field]: num } }))
  }

  async function saveAll() {
    setSaving(true)
    const supabase = getSupabase()

    for (const [id, values] of Object.entries(editing)) {
      await supabase.from('pricing_plans').update(values).eq('id', id)
    }

    setSaving(false)
    setEditing({})
    fetchPlans()
  }

  const isEditing = Object.keys(editing).length > 0

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-steel-50">
        <div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar onLogout={handleLogout} />

      <main className="flex-1 p-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-xl font-medium text-steel-900">Tarification</h1>
            <p className="text-sm text-steel-500 mt-1">Gérer les prix par pays, licence et taille</p>
          </div>
          <button
            onClick={() => setShowAddCountry(true)}
            className="px-4 py-2.5 bg-brand hover:bg-brand-600 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Ajouter un pays
          </button>
        </div>

        {/* Country tabs */}
        <div className="flex gap-2 mb-6">
          {countries.map(c => (
            <button
              key={c}
              onClick={() => { setSelectedCountry(c); setEditing({}) }}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                selectedCountry === c
                  ? 'bg-brand text-white'
                  : 'bg-white border border-steel-200 text-steel-600 hover:bg-steel-50'
              }`}
            >
              {c}
            </button>
          ))}
        </div>

        {/* Pricing table */}
        {selectedCountry && (
          <div className="bg-white rounded-xl border border-steel-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-steel-200 bg-steel-50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-medium text-steel-700">{selectedCountry}</h2>
                <span className="text-xs text-steel-400">({countryCurrency})</span>
              </div>
              {!isEditing ? (
                <button
                  onClick={startEditing}
                  className="px-3 py-1.5 text-sm text-brand font-medium hover:bg-brand-50 rounded-lg transition-colors"
                >
                  Modifier les prix
                </button>
              ) : (
                <div className="flex gap-2">
                  <button
                    onClick={() => setEditing({})}
                    className="px-3 py-1.5 text-sm text-steel-500 font-medium hover:bg-steel-100 rounded-lg transition-colors"
                  >
                    Annuler
                  </button>
                  <button
                    onClick={saveAll}
                    disabled={saving}
                    className="px-3 py-1.5 text-sm text-white bg-brand hover:bg-brand-600 disabled:opacity-50 font-medium rounded-lg transition-colors"
                  >
                    {saving ? 'Enregistrement...' : 'Enregistrer'}
                  </button>
                </div>
              )}
            </div>

            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-steel-200">
                  <th className="text-left px-4 py-3 text-steel-500 font-medium">Licence</th>
                  <th className="text-left px-4 py-3 text-steel-500 font-medium">Taille</th>
                  <th className="text-right px-4 py-3 text-steel-500 font-medium">Frais d'installation</th>
                  <th className="text-right px-4 py-3 text-steel-500 font-medium">Licence annuelle</th>
                </tr>
              </thead>
              <tbody>
                {countryPlans.map(plan => {
                  const ed = editing[plan.id]
                  return (
                    <tr key={plan.id} className="border-b border-steel-100">
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                          plan.tier === 'PRO' ? 'bg-brand-50 text-brand-600' : 'bg-steel-100 text-steel-600'
                        }`}>
                          {TIER_LABELS[plan.tier]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-steel-700">{SIZE_LABELS[plan.size]}</td>
                      <td className="px-4 py-3 text-right">
                        {ed ? (
                          <input
                            type="number" min="0" step="1000" value={ed.setup_fee}
                            onChange={(e) => updateField(plan.id, 'setup_fee', e.target.value)}
                            className="w-32 px-2 py-1.5 border border-steel-200 rounded-lg text-sm text-right focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand"
                          />
                        ) : (
                          <span className="text-steel-800">{plan.setup_fee.toLocaleString('fr-FR')} {countryCurrency}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {ed ? (
                          <input
                            type="number" min="0" step="1000" value={ed.annual_fee}
                            onChange={(e) => updateField(plan.id, 'annual_fee', e.target.value)}
                            className="w-32 px-2 py-1.5 border border-steel-200 rounded-lg text-sm text-right focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand"
                          />
                        ) : (
                          <span className="text-steel-800">{plan.annual_fee.toLocaleString('fr-FR')} {countryCurrency}</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Info note */}
        <div className="mt-4 p-4 bg-steel-50 rounded-lg border border-steel-200">
          <p className="text-xs text-steel-500">
            Les modifications de prix s'appliquent uniquement aux nouvelles inscriptions.
            Les écoles déjà enregistrées conservent le tarif en vigueur au moment de leur inscription.
          </p>
        </div>
      </main>

      <AddCountryModal
        open={showAddCountry}
        onClose={() => setShowAddCountry(false)}
        onCreated={fetchPlans}
        existingCountries={countries}
      />
    </div>
  )
}
