'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabase } from '@/lib/supabase'
import { PageShell, formatXOF } from '@/lib/ui'

const STANDARD_FEATURES = ['students', 'grades', 'reports', 'promotion']
const PRO_FEATURES = ['students', 'grades', 'reports', 'promotion', 'finance', 'payments', 'salary', 'expenses', 'bi']

const FEATURE_LABELS = {
  students: 'Gestion des élèves', grades: 'Saisie des notes', reports: 'Bulletins scolaires',
  promotion: 'Promotion', finance: 'Module financier', payments: 'Suivi des paiements',
  salary: 'Gestion des salaires', expenses: 'Suivi des dépenses', bi: 'Tableau de bord BI',
}

const MONTHS = [
  { v: 1, l: 'Janvier' }, { v: 2, l: 'Février' }, { v: 3, l: 'Mars' }, { v: 4, l: 'Avril' },
  { v: 5, l: 'Mai' }, { v: 6, l: 'Juin' }, { v: 7, l: 'Juillet' }, { v: 8, l: 'Août' },
  { v: 9, l: 'Septembre' }, { v: 10, l: 'Octobre' }, { v: 11, l: 'Novembre' }, { v: 12, l: 'Décembre' },
]

function KeyRevealModal({ licenseKey, onConfirm }) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(licenseKey)
      setCopied(true)
    } catch {
      setCopied(true)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-8 text-center">
        <div className="w-12 h-12 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-steel-900 mb-1">Copiez cette clé maintenant</h2>
        <p className="text-sm text-steel-500 mb-6">Elle ne sera plus affichée.</p>

        <div className="bg-steel-50 border border-steel-200 rounded-lg p-4 mb-6">
          <p className="text-xl font-mono font-bold text-steel-900 tracking-wider">{licenseKey}</p>
        </div>

        <div className="flex gap-3">
          <button onClick={handleCopy}
            className="flex-1 py-2.5 border border-steel-200 text-steel-600 rounded-lg text-sm font-medium hover:bg-steel-50 transition-colors">
            {copied ? 'Copié !' : 'Copier la clé'}
          </button>
          <button onClick={onConfirm} disabled={!copied}
            className="flex-1 py-2.5 bg-brand hover:bg-brand-600 disabled:opacity-30 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors">
            J'ai copié →
          </button>
        </div>
      </div>
    </div>
  )
}

export default function NewSchoolPage() {
  const router = useRouter()
  const [pricingPlans, setPricingPlans] = useState([])
  const [countries, setCountries] = useState([])

  const [form, setForm] = useState({
    school_name: '', director_name: '', phone: '', city: '', country: 'Bénin', notes: '',
    tier: 'STANDARD',
    declared_student_count: '',
    rate_per_student: '',
    installation_fee: '',
    semesters_active: 3,
    features: [...STANDARD_FEATURES],
    semester_1_deadline: 12, semester_2_deadline: 3, semester_3_deadline: 6,
    engineer: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [revealKey, setRevealKey] = useState(null)
  const [createdSchoolId, setCreatedSchoolId] = useState(null)

  useEffect(() => {
    async function loadPricing() {
      const supabase = getSupabase()
      const { data } = await supabase.from('pricing_plans').select('*').eq('is_active', true).order('country')
      setPricingPlans(data || [])
      setCountries([...new Set((data || []).map(p => p.country))])
    }
    loadPricing()
  }, [])

  function getCountryPlan() {
    return pricingPlans.find(p => p.country === form.country && p.tier === form.tier)
  }

  function getEffectiveRate() {
    const plan = getCountryPlan()
    if (form.rate_per_student !== '') return parseInt(form.rate_per_student) || 0
    return plan?.rate_per_student || 0
  }

  function getEffectiveInstallation() {
    const plan = getCountryPlan()
    if (form.installation_fee !== '') return parseInt(form.installation_fee) || 0
    return plan?.installation_fee_default || 0
  }

  function update(field, value) {
    setForm(prev => {
      const next = { ...prev, [field]: value }
      if (field === 'tier') {
        next.features = value === 'PRO' ? [...PRO_FEATURES] : [...STANDARD_FEATURES]
        next.rate_per_student = ''
        next.installation_fee = ''
      }
      if (field === 'country') {
        next.rate_per_student = ''
        next.installation_fee = ''
      }
      return next
    })
  }

  function toggleFeature(feat) {
    setForm(prev => {
      const has = prev.features.includes(feat)
      return { ...prev, features: has ? prev.features.filter(f => f !== feat) : [...prev.features, feat] }
    })
  }

  const declaredCount = parseInt(form.declared_student_count) || 0
  const rate = getEffectiveRate()
  const installation = getEffectiveInstallation()
  const projectedAnnual = declaredCount * rate
  const upfrontTarget = Math.round(projectedAnnual * 0.75)
  const plan = getCountryPlan()
  const isRateOverridden = form.rate_per_student !== '' && parseInt(form.rate_per_student) !== (plan?.rate_per_student || 0)
  const isInstallOverridden = form.installation_fee !== '' && parseInt(form.installation_fee) !== (plan?.installation_fee_default || 0)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (declaredCount < 1) { setError('Le nombre d\'élèves déclarés est requis'); return }

    setSaving(true)
    const supabase = getSupabase()
    const countryPlan = pricingPlans.find(p => p.country === form.country)
    const countryCode = countryPlan?.country_code || 'BJ'

    const { data: schoolCode, error: codeErr } = await supabase.rpc('generate_school_code', { p_country_code: countryCode })
    if (codeErr || !schoolCode?.[0]) { setError('Erreur de génération du code'); setSaving(false); return }

    const { school_code, school_prefix } = schoolCode[0]

    const { data: keyData, error: keyErr } = await supabase.rpc('generate_license_key')
    if (keyErr || !keyData?.[0]) { setError('Erreur de génération de la clé'); setSaving(false); return }

    const { plain_key, key_hash, key_preview } = keyData[0]

    const { data: expiryData } = await supabase.rpc('compute_expiry_date')
    const expiryDate = expiryData || new Date().getFullYear() + '-08-30'

    const { data: school, error: schoolErr } = await supabase
      .from('schools')
      .insert({
        school_code,
        school_prefix,
        school_name: form.school_name.trim(),
        director_name: form.director_name.trim(),
        phone: form.phone.trim() || null,
        city: form.city.trim() || null,
        country: form.country,
        country_code: countryCode,
        notes: form.notes.trim() || null,
      })
      .select('id')
      .single()

    if (schoolErr) { setError('Erreur lors de la création de l\'école'); setSaving(false); return }

    const { error: licErr } = await supabase.from('licenses').insert({
      school_id: school.id,
      license_key_hash: key_hash,
      license_key_preview: key_preview,
      tier: form.tier,
      rate_per_student: rate,
      declared_student_count: declaredCount,
      paid_student_count: 0,
      allowed_students: declaredCount,
      amount_paid: 0,
      installation_fee: installation,
      installation_fee_paid: false,
      semesters_active: form.semesters_active,
      features: form.features,
      semester_1_deadline: form.semester_1_deadline || null,
      semester_2_deadline: form.semester_2_deadline || null,
      semester_3_deadline: form.semester_3_deadline || null,
      expiry_date: expiryDate,
      assigned_engineer: form.engineer.trim() || null,
    })

    if (licErr) { setError('École créée mais erreur sur la licence: ' + licErr.message); setSaving(false); return }

    await supabase.from('cap_audit_logs').insert({
      actor: 'owner',
      action: 'SCHOOL_CREATED',
      entity_type: 'school',
      entity_id: school.id,
      new_values: { school_code, tier: form.tier, declared_student_count: declaredCount, rate_per_student: rate },
    })

    setSaving(false)
    setCreatedSchoolId(school.id)
    setRevealKey(plain_key)
  }

  return (
    <PageShell>
      <div className="max-w-2xl">
        <h1 className="text-xl font-medium text-steel-900 mb-1">Nouvelle école</h1>
        <p className="text-sm text-steel-500 mb-8">Enregistrer un établissement et générer sa licence.</p>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Section 1: School Profile */}
          <div className="bg-white rounded-xl border border-steel-200 p-6 space-y-4">
            <h2 className="text-sm font-semibold text-steel-700 uppercase tracking-wide">Profil de l'école</h2>

            <div>
              <label className="block text-sm text-steel-600 mb-1">Nom de l'école <span className="text-red-500">*</span></label>
              <input type="text" required value={form.school_name} onChange={e => update('school_name', e.target.value)}
                className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-steel-600 mb-1">Nom du directeur <span className="text-red-500">*</span></label>
                <input type="text" required value={form.director_name} onChange={e => update('director_name', e.target.value)}
                  className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand" />
              </div>
              <div>
                <label className="block text-sm text-steel-600 mb-1">Téléphone</label>
                <input type="tel" value={form.phone} onChange={e => update('phone', e.target.value)} placeholder="+229 XX XX XX XX"
                  className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-steel-600 mb-1">Ville <span className="text-red-500">*</span></label>
                <input type="text" required value={form.city} onChange={e => update('city', e.target.value)}
                  className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand" />
              </div>
              <div>
                <label className="block text-sm text-steel-600 mb-1">Pays</label>
                <select value={form.country} onChange={e => update('country', e.target.value)}
                  className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand bg-white">
                  {countries.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm text-steel-600 mb-1">Notes internes</label>
              <textarea value={form.notes} onChange={e => update('notes', e.target.value)} rows={2}
                className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand resize-none" />
            </div>
          </div>

          {/* Section 2: License + Pricing */}
          <div className="bg-white rounded-xl border border-steel-200 p-6 space-y-4">
            <h2 className="text-sm font-semibold text-steel-700 uppercase tracking-wide">Licence et tarification</h2>

            {/* Tier */}
            <div>
              <label className="block text-sm text-steel-600 mb-1">Licence <span className="text-red-500">*</span></label>
              <div className="flex gap-2">
                {['STANDARD', 'PRO'].map(t => (
                  <button key={t} type="button" onClick={() => update('tier', t)}
                    className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors ${
                      form.tier === t ? 'border-brand bg-brand-50 text-brand-600' : 'border-steel-200 text-steel-500 hover:border-steel-300'
                    }`}>{t === 'STANDARD' ? 'Standard' : 'Pro'}</button>
                ))}
              </div>
            </div>

            {/* Student count + Rate */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-steel-600 mb-1">Élèves déclarés <span className="text-red-500">*</span></label>
                <input type="number" min="1" value={form.declared_student_count}
                  onChange={e => update('declared_student_count', e.target.value)}
                  placeholder="Ex: 350"
                  className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand" />
              </div>
              <div>
                <label className="block text-sm text-steel-600 mb-1">
                  Tarif / élève / an
                  {isRateOverridden && <span className="text-yellow-600 text-xs ml-1">(personnalisé)</span>}
                </label>
                <input type="number" min="0" step="500"
                  value={form.rate_per_student}
                  onChange={e => update('rate_per_student', e.target.value)}
                  placeholder={plan?.rate_per_student?.toString() || '2000'}
                  className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand ${
                    isRateOverridden ? 'border-yellow-300 bg-yellow-50' : 'border-steel-200'
                  }`} />
                <p className="text-xs text-steel-400 mt-0.5">
                  Défaut {form.country}: {formatXOF(plan?.rate_per_student || 0)} / élève
                </p>
              </div>
            </div>

            {/* Installation fee */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-steel-600 mb-1">
                  Frais d'installation
                  {isInstallOverridden && <span className="text-yellow-600 text-xs ml-1">(personnalisé)</span>}
                </label>
                <input type="number" min="0" step="5000"
                  value={form.installation_fee}
                  onChange={e => update('installation_fee', e.target.value)}
                  placeholder={plan?.installation_fee_default?.toString() || '25000'}
                  className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand ${
                    isInstallOverridden ? 'border-yellow-300 bg-yellow-50' : 'border-steel-200'
                  }`} />
                <p className="text-xs text-steel-400 mt-0.5">
                  Défaut: {formatXOF(plan?.installation_fee_default || 0)}
                </p>
              </div>
              <div>
                <label className="block text-sm text-steel-600 mb-1">Trimestres <span className="text-red-500">*</span></label>
                <div className="flex gap-2">
                  {[1, 2, 3].map(n => (
                    <button key={n} type="button" onClick={() => update('semesters_active', n)}
                      className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors ${
                        form.semesters_active === n ? 'border-brand bg-brand-50 text-brand-600' : 'border-steel-200 text-steel-500 hover:border-steel-300'
                      }`}>{n}</button>
                  ))}
                </div>
              </div>
            </div>

            {/* Pricing summary */}
            {declaredCount > 0 && (
              <div className="bg-steel-50 rounded-lg p-4 space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-steel-500">{declaredCount} élèves × {formatXOF(rate)}</span>
                  <span className="text-steel-800">{formatXOF(projectedAnnual)} / an</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-steel-500">75% acompte (objectif oct.)</span>
                  <span className="text-brand font-medium">{formatXOF(upfrontTarget)}</span>
                </div>
                {installation > 0 && (
                  <div className="flex justify-between">
                    <span className="text-steel-500">Installation (1ère année)</span>
                    <span className="text-steel-800">{formatXOF(installation)}</span>
                  </div>
                )}
                <hr className="border-steel-200" />
                <div className="flex justify-between font-medium">
                  <span className="text-steel-700">Total 1ère année</span>
                  <span className="text-steel-900">{formatXOF(projectedAnnual + installation)}</span>
                </div>
              </div>
            )}

            {/* Features */}
            <div>
              <label className="block text-sm text-steel-600 mb-2">Fonctionnalités</label>
              <div className="grid grid-cols-3 gap-2">
                {Object.entries(FEATURE_LABELS).map(([key, label]) => (
                  <label key={key} className="flex items-center gap-2 text-xs text-steel-600 cursor-pointer">
                    <input type="checkbox" checked={form.features.includes(key)} onChange={() => toggleFeature(key)}
                      className="rounded border-steel-300 text-brand focus:ring-brand" />
                    {label}
                  </label>
                ))}
              </div>
            </div>

            {/* Deadlines */}
            <div className="grid grid-cols-3 gap-4">
              {[
                { field: 'semester_1_deadline', label: 'Deadline T1' },
                { field: 'semester_2_deadline', label: 'Deadline T2' },
                { field: 'semester_3_deadline', label: 'Deadline T3' },
              ].map(({ field, label }) => (
                <div key={field}>
                  <label className="block text-xs text-steel-500 mb-1">{label}</label>
                  <select value={form[field] || ''} onChange={e => update(field, e.target.value ? parseInt(e.target.value) : null)}
                    className="w-full px-3 py-2 border border-steel-200 rounded-lg text-xs focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand bg-white">
                    <option value="">—</option>
                    {MONTHS.map(m => <option key={m.v} value={m.v}>{m.l}</option>)}
                  </select>
                </div>
              ))}
            </div>

            {/* Engineer */}
            <div>
              <label className="block text-sm text-steel-600 mb-1">Ingénieur assigné</label>
              <input type="text" value={form.engineer} onChange={e => update('engineer', e.target.value)}
                className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand"
                placeholder="Qui va installer ?" />
            </div>
          </div>

          {error && <p className="text-red-500 text-sm">{error}</p>}

          <button type="submit" disabled={saving || !form.school_name || !form.director_name || !form.city || declaredCount < 1}
            className="w-full py-3 bg-brand hover:bg-brand-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors">
            {saving ? 'Création en cours...' : 'Créer l\'école et générer la clé'}
          </button>
        </form>
      </div>

      {revealKey && (
        <KeyRevealModal
          licenseKey={revealKey}
          onConfirm={() => router.push(`/schools/${createdSchoolId}`)}
        />
      )}
    </PageShell>
  )
}
