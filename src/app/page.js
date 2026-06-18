'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabase } from '@/lib/supabase'

const STATUS_LABELS = {
  pending_activation: 'En attente',
  active: 'Actif',
  suspended: 'Suspendu',
  expired: 'Expiré',
  deactivated: 'Désactivé',
}

const STATUS_COLORS = {
  pending_activation: 'bg-yellow-100 text-yellow-800',
  active: 'bg-brand-50 text-brand-600',
  suspended: 'bg-red-100 text-red-800',
  expired: 'bg-steel-200 text-steel-600',
  deactivated: 'bg-red-100 text-red-700',
}

// ─── Sidebar ─────────────────────────────────────────────────
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
        <a href="/" className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-steel-700/50 text-steel-200 text-sm">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
          Écoles
        </a>
        <a href="/pricing" className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-steel-400 hover:text-steel-200 hover:bg-steel-700/50 text-sm transition-colors">
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

// ─── Add School Modal (dynamic pricing from DB) ──────────────
function AddSchoolModal({ open, onClose, onCreated }) {
  const [form, setForm] = useState({
    school_name: '', director_name: '', director_phone: '',
    director_email: '', city: '', address: '', country: 'Bénin',
    tier: 'STANDARD', size: 'S', semesters_active: 3,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [pricingPlans, setPricingPlans] = useState([])
  const [countries, setCountries] = useState([])

  useEffect(() => {
    if (!open) return
    async function loadPricing() {
      const supabase = getSupabase()
      const { data } = await supabase
        .from('pricing_plans')
        .select('*')
        .eq('is_active', true)
        .order('country')
      setPricingPlans(data || [])
      const unique = [...new Set((data || []).map(p => p.country))]
      setCountries(unique)
    }
    loadPricing()
  }, [open])

  function update(field, value) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  function getPricing() {
    const plan = pricingPlans.find(
      p => p.country === form.country && p.tier === form.tier && p.size === form.size
    )
    if (!plan) return { setup_fee: 0, annual_fee: 0, currency: 'XOF' }
    return plan
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSaving(true)

    const supabase = getSupabase()
    const pricing = getPricing()

    const countryPlan = pricingPlans.find(p => p.country === form.country)
    const countryCode = countryPlan?.country_code || 'BJ'

    const { data: codeResult, error: codeErr } = await supabase.rpc('generate_school_code', { p_country_code: countryCode })
    if (codeErr) {
      setError('Erreur de génération du code école')
      setSaving(false)
      return
    }

    const prorated = Math.round(pricing.annual_fee * (form.semesters_active / 3))

    const { data: school, error: schoolErr } = await supabase
      .from('schools')
      .insert({
        school_code: codeResult,
        school_name: form.school_name.trim(),
        director_name: form.director_name.trim(),
        director_phone: form.director_phone.trim() || null,
        director_email: form.director_email.trim() || null,
        city: form.city.trim() || null,
        address: form.address.trim() || null,
        country: form.country,
      })
      .select('id')
      .single()

    if (schoolErr) {
      setError('Erreur lors de la création de l\'école')
      setSaving(false)
      return
    }

    const { error: licErr } = await supabase
      .from('licenses')
      .insert({
        school_id: school.id,
        tier: form.tier,
        size: form.size,
        semesters_active: form.semesters_active,
        setup_fee: pricing.setup_fee,
        annual_fee: pricing.annual_fee,
        annual_fee_assigned: prorated,
      })

    if (licErr) {
      setError('École créée mais erreur sur la licence')
      setSaving(false)
      return
    }

    setSaving(false)
    setForm({
      school_name: '', director_name: '', director_phone: '',
      director_email: '', city: '', address: '', country: 'Bénin',
      tier: 'STANDARD', size: 'S', semesters_active: 3,
    })
    onCreated()
    onClose()
  }

  if (!open) return null

  const pricing = getPricing()
  const prorated = Math.round(pricing.annual_fee * (form.semesters_active / 3))

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-steel-200">
          <h2 className="text-lg font-medium text-steel-900">Ajouter une école</h2>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm text-steel-600 mb-1">Nom de l'école <span className="text-red-500">*</span></label>
            <input
              type="text" required value={form.school_name}
              onChange={(e) => update('school_name', e.target.value)}
              className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-steel-600 mb-1">Nom du directeur <span className="text-red-500">*</span></label>
              <input
                type="text" required value={form.director_name}
                onChange={(e) => update('director_name', e.target.value)}
                className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand"
              />
            </div>
            <div>
              <label className="block text-sm text-steel-600 mb-1">Téléphone du directeur</label>
              <input
                type="tel" value={form.director_phone}
                onChange={(e) => update('director_phone', e.target.value)}
                className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand"
                placeholder="+229 XX XX XX XX"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm text-steel-600 mb-1">Email du directeur</label>
            <input
              type="email" value={form.director_email}
              onChange={(e) => update('director_email', e.target.value)}
              className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-steel-600 mb-1">Ville</label>
              <input
                type="text" value={form.city}
                onChange={(e) => update('city', e.target.value)}
                className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand"
              />
            </div>
            <div>
              <label className="block text-sm text-steel-600 mb-1">Adresse</label>
              <input
                type="text" value={form.address}
                onChange={(e) => update('address', e.target.value)}
                className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand"
              />
            </div>
          </div>

          <hr className="border-steel-100" />

          {/* Country + License config */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-steel-600 mb-1">Pays <span className="text-red-500">*</span></label>
              <select
                value={form.country} onChange={(e) => update('country', e.target.value)}
                className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand bg-white"
              >
                {countries.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm text-steel-600 mb-1">Licence <span className="text-red-500">*</span></label>
              <select
                value={form.tier} onChange={(e) => update('tier', e.target.value)}
                className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand bg-white"
              >
                <option value="STANDARD">Standard</option>
                <option value="PRO">Pro</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-steel-600 mb-1">Taille <span className="text-red-500">*</span></label>
              <select
                value={form.size} onChange={(e) => update('size', e.target.value)}
                className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand bg-white"
              >
                <option value="S">Petite (S)</option>
                <option value="M">Moyenne (M)</option>
                <option value="L">Grande (L)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-steel-600 mb-1">Trimestres <span className="text-red-500">*</span></label>
              <select
                value={form.semesters_active} onChange={(e) => update('semesters_active', parseInt(e.target.value))}
                className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand bg-white"
              >
                <option value={1}>1 trimestre</option>
                <option value={2}>2 trimestres</option>
                <option value={3}>3 trimestres</option>
              </select>
            </div>
          </div>

          {/* Pricing summary */}
          <div className="bg-steel-50 rounded-lg p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-steel-500">Frais d'installation</span>
              <span className="text-steel-800 font-medium">{pricing.setup_fee.toLocaleString('fr-FR')} {pricing.currency}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-steel-500">Licence annuelle</span>
              <span className="text-steel-800 font-medium">{pricing.annual_fee.toLocaleString('fr-FR')} {pricing.currency}</span>
            </div>
            {form.semesters_active < 3 && (
              <div className="flex justify-between text-sm">
                <span className="text-steel-500">Prorata ({form.semesters_active}/3)</span>
                <span className="text-brand font-medium">{prorated.toLocaleString('fr-FR')} {pricing.currency}</span>
              </div>
            )}
            <hr className="border-steel-200" />
            <div className="flex justify-between text-sm font-medium">
              <span className="text-steel-700">Total à percevoir</span>
              <span className="text-steel-900">{(pricing.setup_fee + prorated).toLocaleString('fr-FR')} {pricing.currency}</span>
            </div>
          </div>

          {error && <p className="text-red-500 text-sm">{error}</p>}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 border border-steel-200 text-steel-600 rounded-lg text-sm font-medium hover:bg-steel-50 transition-colors">
              Annuler
            </button>
            <button type="submit" disabled={saving} className="flex-1 py-2.5 bg-brand hover:bg-brand-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors">
              {saving ? 'Création...' : 'Créer l\'école'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── School Detail Modal (full operational view) ─────────────
function SchoolDetail({ school, onClose, onUpdated }) {
  const [toggling, setToggling] = useState(false)
  const [hwBinding, setHwBinding] = useState(null)
  const [otpHistory, setOtpHistory] = useState([])
  const [lastSync, setLastSync] = useState(null)
  const [loadingExtra, setLoadingExtra] = useState(true)
  const [generatingOtp, setGeneratingOtp] = useState(false)
  const [newOtpCode, setNewOtpCode] = useState(null)

  async function loadDetails() {
    setLoadingExtra(true)
    const supabase = getSupabase()

    const [hwRes, otpRes, syncRes] = await Promise.all([
      supabase.from('hardware_bindings').select('*').eq('school_id', school.id).maybeSingle(),
      supabase.from('otp_codes').select('*').eq('school_id', school.id).order('created_at', { ascending: false }).limit(5),
      supabase.from('sync_log').select('*').eq('school_id', school.id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    ])

    setHwBinding(hwRes.data)
    setOtpHistory(otpRes.data || [])
    setLastSync(syncRes.data)
    setLoadingExtra(false)
  }

  useEffect(() => {
    if (!school) return
    setNewOtpCode(null)
    loadDetails()
  }, [school])

  async function generateOtp() {
    setGeneratingOtp(true)
    setNewOtpCode(null)
    const supabase = getSupabase()

    const code = String(Math.floor(100000 + Math.random() * 900000))

    const { error } = await supabase.from('otp_codes').insert({
      school_id: school.id,
      code,
      channel: 'manual',
    })

    if (!error) {
      setNewOtpCode(code)
      loadDetails()
    }
    setGeneratingOtp(false)
  }

  if (!school) return null

  async function toggleActive() {
    setToggling(true)
    const supabase = getSupabase()
    const newActive = !school.licenses[0]?.is_active

    await supabase.from('licenses').update({ is_active: newActive }).eq('school_id', school.id)
    await supabase.from('schools').update({ status: newActive ? 'active' : 'suspended' }).eq('id', school.id)

    setToggling(false)
    onUpdated()
    onClose()
  }

  const license = school.licenses?.[0]
  const isActive = license?.is_active

  function formatDate(d) {
    if (!d) return '—'
    return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
  }

  function formatDateTime(d) {
    if (!d) return '—'
    return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  function daysUntilExpiry() {
    if (!license?.expiry_date) return null
    const diff = Math.ceil((new Date(license.expiry_date) - new Date()) / (1000 * 60 * 60 * 24))
    return diff
  }

  const expiryDays = daysUntilExpiry()

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="p-6 border-b border-steel-200 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-medium text-steel-900">{school.school_name}</h2>
            <p className="text-sm text-steel-500 mt-0.5 font-mono">{school.school_code}</p>
          </div>
          <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[school.status]}`}>
            {STATUS_LABELS[school.status]}
          </span>
        </div>

        <div className="p-6 space-y-5">
          {/* School info */}
          <div>
            <h3 className="text-xs font-medium text-steel-400 uppercase tracking-wide mb-3">Informations</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-steel-400">Directeur</p>
                <p className="text-steel-800 font-medium">{school.director_name}</p>
              </div>
              <div>
                <p className="text-steel-400">Téléphone</p>
                <p className="text-steel-800">{school.director_phone || '—'}</p>
              </div>
              <div>
                <p className="text-steel-400">Ville</p>
                <p className="text-steel-800">{school.city || '—'}</p>
              </div>
              <div>
                <p className="text-steel-400">Email</p>
                <p className="text-steel-800">{school.director_email || '—'}</p>
              </div>
              <div>
                <p className="text-steel-400">Pays</p>
                <p className="text-steel-800">{school.country || '—'}</p>
              </div>
              <div>
                <p className="text-steel-400">Inscrit le</p>
                <p className="text-steel-800">{formatDate(school.created_at)}</p>
              </div>
            </div>
          </div>

          {/* License plan */}
          {license && (
            <div>
              <h3 className="text-xs font-medium text-steel-400 uppercase tracking-wide mb-3">Licence</h3>
              <div className="bg-steel-50 rounded-lg p-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-steel-400">Plan</p>
                    <p className="text-steel-800 font-medium">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium mr-1 ${
                        license.tier === 'PRO' ? 'bg-brand-50 text-brand-600' : 'bg-steel-200 text-steel-600'
                      }`}>{license.tier}</span>
                      {license.size === 'S' ? 'Petite' : license.size === 'M' ? 'Moyenne' : 'Grande'}
                    </p>
                  </div>
                  <div>
                    <p className="text-steel-400">Trimestres actifs</p>
                    <p className="text-steel-800">{license.semesters_active}/3</p>
                  </div>
                  <div>
                    <p className="text-steel-400">Frais d'installation</p>
                    <p className="text-steel-800">{license.setup_fee?.toLocaleString('fr-FR')} XOF</p>
                  </div>
                  <div>
                    <p className="text-steel-400">Licence annuelle</p>
                    <p className="text-steel-800">{license.annual_fee?.toLocaleString('fr-FR')} XOF</p>
                  </div>
                  <div>
                    <p className="text-steel-400">Montant facturé</p>
                    <p className="text-steel-800 font-medium">{(license.annual_fee_assigned || license.annual_fee)?.toLocaleString('fr-FR')} XOF</p>
                  </div>
                  <div>
                    <p className="text-steel-400">Date d'expiration</p>
                    <p className={`font-medium ${expiryDays !== null && expiryDays < 30 ? 'text-red-500' : 'text-steel-800'}`}>
                      {formatDate(license.expiry_date)}
                      {expiryDays !== null && (
                        <span className="text-xs ml-1 text-steel-400">
                          ({expiryDays > 0 ? `${expiryDays}j restants` : 'expiré'})
                        </span>
                      )}
                    </p>
                  </div>
                  <div>
                    <p className="text-steel-400">Activé le</p>
                    <p className="text-steel-800">{license.activated_at ? formatDateTime(license.activated_at) : 'Non activé'}</p>
                  </div>
                  <div>
                    <p className="text-steel-400">Statut licence</p>
                    <p className={`font-medium ${isActive ? 'text-brand' : 'text-red-500'}`}>
                      {isActive ? 'Active' : 'Désactivée'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Hardware binding */}
          <div>
            <h3 className="text-xs font-medium text-steel-400 uppercase tracking-wide mb-3">Matériel lié</h3>
            {loadingExtra ? (
              <p className="text-sm text-steel-400">Chargement...</p>
            ) : hwBinding ? (
              <div className="bg-steel-50 rounded-lg p-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="col-span-2">
                    <p className="text-steel-400">Empreinte matérielle</p>
                    <p className="text-steel-800 font-mono text-xs break-all">{hwBinding.fingerprint}</p>
                  </div>
                  <div>
                    <p className="text-steel-400">Lié le</p>
                    <p className="text-steel-800">{formatDateTime(hwBinding.bound_at)}</p>
                  </div>
                  <div>
                    <p className="text-steel-400">Re-liaisons</p>
                    <p className="text-steel-800">{hwBinding.rebound_count || 0} fois</p>
                  </div>
                  {hwBinding.previous_fingerprint && (
                    <div className="col-span-2">
                      <p className="text-steel-400">Empreinte précédente</p>
                      <p className="text-steel-600 font-mono text-xs break-all">{hwBinding.previous_fingerprint}</p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="bg-steel-50 rounded-lg p-4 text-center">
                <p className="text-sm text-steel-400">Aucun matériel lié — en attente d'activation</p>
              </div>
            )}
          </div>

          {/* Last sync */}
          <div>
            <h3 className="text-xs font-medium text-steel-400 uppercase tracking-wide mb-3">Dernière synchronisation</h3>
            {loadingExtra ? (
              <p className="text-sm text-steel-400">Chargement...</p>
            ) : lastSync ? (
              <div className="bg-steel-50 rounded-lg p-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-steel-400">Date</p>
                    <p className="text-steel-800">{formatDateTime(lastSync.started_at)}</p>
                  </div>
                  <div>
                    <p className="text-steel-400">Statut</p>
                    <p className={`font-medium ${
                      lastSync.status === 'success' ? 'text-brand' :
                      lastSync.status === 'failed' ? 'text-red-500' : 'text-yellow-600'
                    }`}>
                      {lastSync.status === 'success' ? 'Réussi' :
                       lastSync.status === 'failed' ? 'Échoué' :
                       lastSync.status === 'partial' ? 'Partiel' : 'En cours'}
                    </p>
                  </div>
                  <div>
                    <p className="text-steel-400">Envoyés</p>
                    <p className="text-steel-800">{lastSync.records_sent}</p>
                  </div>
                  <div>
                    <p className="text-steel-400">Reçus</p>
                    <p className="text-steel-800">{lastSync.records_received}</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-steel-50 rounded-lg p-4 text-center">
                <p className="text-sm text-steel-400">Aucune synchronisation effectuée</p>
              </div>
            )}
          </div>

          {/* OTP section */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-medium text-steel-400 uppercase tracking-wide">Historique OTP</h3>
              {school.status === 'pending_activation' && (
                <button
                  onClick={generateOtp}
                  disabled={generatingOtp}
                  className="px-3 py-1.5 text-xs font-medium bg-brand hover:bg-brand-600 disabled:opacity-50 text-white rounded-lg transition-colors"
                >
                  {generatingOtp ? 'Génération...' : 'Générer un OTP'}
                </button>
              )}
            </div>

            {newOtpCode && (
              <div className="bg-brand-50 border border-brand-100 rounded-lg p-4 mb-3 text-center">
                <p className="text-xs text-brand-600 mb-1">Code OTP généré — à communiquer au directeur</p>
                <p className="text-3xl font-mono font-bold text-brand tracking-widest">{newOtpCode}</p>
                <p className="text-xs text-steel-400 mt-2">Expire dans 10 minutes</p>
              </div>
            )}

            {loadingExtra ? (
              <p className="text-sm text-steel-400">Chargement...</p>
            ) : otpHistory.length > 0 ? (
              <div className="bg-steel-50 rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-steel-200">
                      <th className="text-left px-3 py-2 text-steel-400 font-medium">Code</th>
                      <th className="text-left px-3 py-2 text-steel-400 font-medium">Canal</th>
                      <th className="text-left px-3 py-2 text-steel-400 font-medium">Créé</th>
                      <th className="text-left px-3 py-2 text-steel-400 font-medium">Statut</th>
                    </tr>
                  </thead>
                  <tbody>
                    {otpHistory.map(otp => (
                      <tr key={otp.id} className="border-b border-steel-100">
                        <td className="px-3 py-2 font-mono text-steel-700">{otp.code}</td>
                        <td className="px-3 py-2 text-steel-600">{otp.channel}</td>
                        <td className="px-3 py-2 text-steel-600">{formatDateTime(otp.created_at)}</td>
                        <td className="px-3 py-2">
                          <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                            otp.is_used ? 'bg-brand-50 text-brand-600' :
                            new Date(otp.expires_at) < new Date() ? 'bg-steel-200 text-steel-500' :
                            'bg-yellow-100 text-yellow-700'
                          }`}>
                            {otp.is_used ? 'Utilisé' : new Date(otp.expires_at) < new Date() ? 'Expiré' : 'En attente'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="bg-steel-50 rounded-lg p-4 text-center">
                <p className="text-sm text-steel-400">Aucun code OTP généré</p>
              </div>
            )}
          </div>
        </div>

        {/* Footer actions */}
        <div className="p-6 border-t border-steel-200 flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 border border-steel-200 text-steel-600 rounded-lg text-sm font-medium hover:bg-steel-50 transition-colors">
            Fermer
          </button>
          <button
            onClick={toggleActive} disabled={toggling}
            className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ${
              isActive
                ? 'bg-red-50 text-red-600 hover:bg-red-100 border border-red-200'
                : 'bg-brand hover:bg-brand-600 text-white'
            }`}
          >
            {toggling ? '...' : isActive ? 'Désactiver' : 'Réactiver'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Dashboard ──────────────────────────────────────────
export default function DashboardPage() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [schools, setSchools] = useState([])
  const [showAddModal, setShowAddModal] = useState(false)
  const [selectedSchool, setSelectedSchool] = useState(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const router = useRouter()

  const fetchSchools = useCallback(async () => {
    const supabase = getSupabase()
    const { data } = await supabase
      .from('schools')
      .select('*, licenses(*)')
      .order('created_at', { ascending: false })
    setSchools(data || [])
  }, [])

  useEffect(() => {
    async function checkAuth() {
      const supabase = getSupabase()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }
      setUser(session.user)
      setLoading(false)
      fetchSchools()
    }
    checkAuth()
  }, [router, fetchSchools])

  async function handleLogout() {
    const supabase = getSupabase()
    await supabase.auth.signOut()
    router.push('/login')
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-steel-50">
        <div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const filtered = schools.filter(s => {
    const matchesSearch = s.school_name.toLowerCase().includes(search.toLowerCase()) ||
      s.school_code.toLowerCase().includes(search.toLowerCase()) ||
      s.director_name.toLowerCase().includes(search.toLowerCase())
    if (!matchesSearch) return false
    if (statusFilter === 'all') return true
    if (statusFilter === 'active') return s.status === 'active'
    if (statusFilter === 'pending') return s.status === 'pending_activation'
    if (statusFilter === 'suspended') return s.status === 'suspended' || s.status === 'deactivated'
    return true
  })

  const stats = {
    total: schools.length,
    active: schools.filter(s => s.status === 'active').length,
    pending: schools.filter(s => s.status === 'pending_activation').length,
    suspended: schools.filter(s => s.status === 'suspended' || s.status === 'deactivated').length,
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar onLogout={handleLogout} />

      <main className="flex-1 p-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-xl font-medium text-steel-900">Écoles</h1>
            <p className="text-sm text-steel-500 mt-1">Gestion des établissements et licences</p>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2.5 bg-brand hover:bg-brand-600 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Ajouter une école
          </button>
        </div>

        <div className="grid grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Total', value: stats.total, color: 'text-steel-900', filter: 'all' },
            { label: 'Actifs', value: stats.active, color: 'text-brand', filter: 'active' },
            { label: 'En attente', value: stats.pending, color: 'text-yellow-600', filter: 'pending' },
            { label: 'Suspendus', value: stats.suspended, color: 'text-red-500', filter: 'suspended' },
          ].map(stat => (
            <button
              key={stat.label}
              onClick={() => setStatusFilter(statusFilter === stat.filter ? 'all' : stat.filter)}
              className={`bg-white rounded-xl border p-4 text-left transition-colors ${
                statusFilter === stat.filter ? 'border-brand ring-1 ring-brand' : 'border-steel-200 hover:border-steel-300'
              }`}
            >
              <p className="text-sm text-steel-500">{stat.label}</p>
              <p className={`text-2xl font-medium mt-1 ${stat.color}`}>{stat.value}</p>
            </button>
          ))}
        </div>

        <div className="mb-4">
          <input
            type="text"
            placeholder="Rechercher une école, un code ou un directeur..."
            value={search} onChange={(e) => setSearch(e.target.value)}
            className="w-full max-w-md px-3 py-2 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand"
          />
        </div>

        <div className="bg-white rounded-xl border border-steel-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-steel-200 bg-steel-50">
                <th className="text-left px-4 py-3 text-steel-500 font-medium">Code</th>
                <th className="text-left px-4 py-3 text-steel-500 font-medium">École</th>
                <th className="text-left px-4 py-3 text-steel-500 font-medium">Directeur</th>
                <th className="text-left px-4 py-3 text-steel-500 font-medium">Ville</th>
                <th className="text-left px-4 py-3 text-steel-500 font-medium">Licence</th>
                <th className="text-left px-4 py-3 text-steel-500 font-medium">Statut</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-steel-400">
                    {schools.length === 0 ? 'Aucune école enregistrée' : 'Aucun résultat pour cette recherche'}
                  </td>
                </tr>
              ) : (
                filtered.map(school => (
                  <tr key={school.id} onClick={() => setSelectedSchool(school)} className="border-b border-steel-100 hover:bg-steel-50 cursor-pointer transition-colors">
                    <td className="px-4 py-3 font-mono text-brand-600 font-medium">{school.school_code}</td>
                    <td className="px-4 py-3 text-steel-800">{school.school_name}</td>
                    <td className="px-4 py-3 text-steel-600">{school.director_name}</td>
                    <td className="px-4 py-3 text-steel-600">{school.city || '—'}</td>
                    <td className="px-4 py-3">
                      <span className="text-steel-800">{school.licenses?.[0]?.tier}</span>
                      <span className="text-steel-400 ml-1">({school.licenses?.[0]?.size})</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[school.status]}`}>
                        {STATUS_LABELS[school.status]}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </main>

      <AddSchoolModal open={showAddModal} onClose={() => setShowAddModal(false)} onCreated={fetchSchools} />
      <SchoolDetail school={selectedSchool} onClose={() => setSelectedSchool(null)} onUpdated={fetchSchools} />
    </div>
  )
}
