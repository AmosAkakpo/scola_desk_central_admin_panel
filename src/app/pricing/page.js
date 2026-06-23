'use client'

import { useState, useEffect, useCallback } from 'react'
import { getSupabase } from '@/lib/supabase'
import { PageShell, formatXOF } from '@/lib/ui'

const TIER_LABELS = { STANDARD: 'Standard', PRO: 'Pro' }

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
    if (code.length !== 2) { setError('Le code pays doit contenir 2 lettres (ex: BJ, TG, CI)'); return }
    if (existingCountries.includes(name)) { setError('Ce pays existe déjà'); return }

    setSaving(true)
    setError('')
    const supabase = getSupabase()

    const rows = [
      { country: name, country_code: code, tier: 'STANDARD', rate_per_student: 2000, installation_fee_default: 25000, currency: currency.trim() || 'XOF' },
      { country: name, country_code: code, tier: 'PRO', rate_per_student: 3000, installation_fee_default: 25000, currency: currency.trim() || 'XOF' },
    ]

    const { error: insertErr } = await supabase.from('pricing_plans').insert(rows)
    if (insertErr) { setError('Erreur lors de la création'); setSaving(false); return }

    setSaving(false)
    setCountry(''); setCountryCode(''); setCurrency('XOF')
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
            <input type="text" required value={country} onChange={e => setCountry(e.target.value)}
              className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand"
              placeholder="Ex: Togo, Côte d'Ivoire..." />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-steel-600 mb-1">Code pays <span className="text-red-500">*</span></label>
              <input type="text" required value={countryCode} maxLength={2} onChange={e => setCountryCode(e.target.value.toUpperCase())}
                className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand uppercase"
                placeholder="BJ, TG, CI..." />
            </div>
            <div>
              <label className="block text-sm text-steel-600 mb-1">Devise</label>
              <input type="text" value={currency} onChange={e => setCurrency(e.target.value)}
                className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand" />
            </div>
          </div>
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 border border-steel-200 text-steel-600 rounded-lg text-sm font-medium hover:bg-steel-50 transition-colors">Annuler</button>
            <button type="submit" disabled={saving} className="flex-1 py-2.5 bg-brand hover:bg-brand-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors">
              {saving ? 'Création...' : 'Ajouter'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function PricingPage() {
  const [plans, setPlans] = useState([])
  const [selectedCountry, setSelectedCountry] = useState('')
  const [editing, setEditing] = useState({})
  const [saving, setSaving] = useState(false)
  const [showAddCountry, setShowAddCountry] = useState(false)

  const fetchPlans = useCallback(async () => {
    const supabase = getSupabase()
    const { data } = await supabase.from('pricing_plans').select('*').eq('is_active', true).order('country').order('tier')
    setPlans(data || [])
    if (!selectedCountry && data?.length > 0) setSelectedCountry(data[0].country)
  }, [selectedCountry])

  useEffect(() => { fetchPlans() }, [fetchPlans])

  const countries = [...new Set(plans.map(p => p.country))]
  const countryPlans = plans.filter(p => p.country === selectedCountry)
  const countryCurrency = countryPlans[0]?.currency || 'XOF'
  const isEditing = Object.keys(editing).length > 0

  function startEditing() {
    const map = {}
    countryPlans.forEach(p => { map[p.id] = { rate_per_student: p.rate_per_student, installation_fee_default: p.installation_fee_default } })
    setEditing(map)
  }

  async function saveAll() {
    setSaving(true)
    const supabase = getSupabase()
    for (const [pid, values] of Object.entries(editing)) {
      await supabase.from('pricing_plans').update(values).eq('id', pid)
    }
    setSaving(false)
    setEditing({})
    fetchPlans()
  }

  return (
    <PageShell>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-xl font-medium text-steel-900">Tarification</h1>
          <p className="text-sm text-steel-500 mt-1">Tarifs par défaut par pays. Le tarif par élève peut être personnalisé par école lors de la création de la licence.</p>
        </div>
        <button onClick={() => setShowAddCountry(true)}
          className="px-4 py-2.5 bg-brand hover:bg-brand-600 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Ajouter un pays
        </button>
      </div>

      {/* Country tabs */}
      <div className="flex gap-2 mb-6">
        {countries.map(c => (
          <button key={c} onClick={() => { setSelectedCountry(c); setEditing({}) }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              selectedCountry === c ? 'bg-brand text-white' : 'bg-white border border-steel-200 text-steel-600 hover:bg-steel-50'
            }`}>{c}</button>
        ))}
      </div>

      {selectedCountry && (
        <div className="bg-white rounded-xl border border-steel-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-steel-200 bg-steel-50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-medium text-steel-700">{selectedCountry}</h2>
              <span className="text-xs text-steel-400">({countryCurrency})</span>
            </div>
            {!isEditing ? (
              <button onClick={startEditing} className="px-3 py-1.5 text-sm text-brand font-medium hover:bg-brand-50 rounded-lg transition-colors">Modifier les prix</button>
            ) : (
              <div className="flex gap-2">
                <button onClick={() => setEditing({})} className="px-3 py-1.5 text-sm text-steel-500 font-medium hover:bg-steel-100 rounded-lg transition-colors">Annuler</button>
                <button onClick={saveAll} disabled={saving} className="px-3 py-1.5 text-sm text-white bg-brand hover:bg-brand-600 disabled:opacity-50 font-medium rounded-lg transition-colors">
                  {saving ? 'Enregistrement...' : 'Enregistrer'}
                </button>
              </div>
            )}
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-steel-200">
                <th className="text-left px-4 py-3 text-steel-500 font-medium">Licence</th>
                <th className="text-right px-4 py-3 text-steel-500 font-medium">Tarif par élève / an</th>
                <th className="text-right px-4 py-3 text-steel-500 font-medium">Frais d'installation (défaut)</th>
              </tr>
            </thead>
            <tbody>
              {countryPlans.map(plan => {
                const ed = editing[plan.id]
                return (
                  <tr key={plan.id} className="border-b border-steel-100">
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${plan.tier === 'PRO' ? 'bg-brand-50 text-brand-600' : 'bg-steel-100 text-steel-600'}`}>
                        {TIER_LABELS[plan.tier]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {ed ? (
                        <div className="flex items-center justify-end gap-1">
                          <input type="number" min="0" step="500" value={ed.rate_per_student}
                            onChange={e => setEditing(prev => ({ ...prev, [plan.id]: { ...prev[plan.id], rate_per_student: parseInt(e.target.value) || 0 } }))}
                            className="w-28 px-2 py-1.5 border border-steel-200 rounded-lg text-sm text-right focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand" />
                          <span className="text-xs text-steel-400">{countryCurrency}/élève</span>
                        </div>
                      ) : <span className="text-steel-800">{formatXOF(plan.rate_per_student)} <span className="text-steel-400 text-xs">/ élève</span></span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {ed ? (
                        <input type="number" min="0" step="5000" value={ed.installation_fee_default}
                          onChange={e => setEditing(prev => ({ ...prev, [plan.id]: { ...prev[plan.id], installation_fee_default: parseInt(e.target.value) || 0 } }))}
                          className="w-28 px-2 py-1.5 border border-steel-200 rounded-lg text-sm text-right focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand" />
                      ) : <span className="text-steel-800">{formatXOF(plan.installation_fee_default)}</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          {/* Example calculation */}
          {countryPlans.length > 0 && (
            <div className="px-4 py-3 bg-steel-50 border-t border-steel-200">
              <p className="text-xs text-steel-500">
                Exemple : une école Pro avec 400 élèves → {formatXOF(countryPlans.find(p => p.tier === 'PRO')?.rate_per_student * 400 || 0)} / an
                + {formatXOF(countryPlans.find(p => p.tier === 'PRO')?.installation_fee_default || 0)} installation (1ère année)
              </p>
            </div>
          )}
        </div>
      )}

      <AddCountryModal open={showAddCountry} onClose={() => setShowAddCountry(false)} onCreated={fetchPlans} existingCountries={countries} />
    </PageShell>
  )
}
