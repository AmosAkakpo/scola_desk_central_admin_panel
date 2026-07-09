'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { getSupabase, getCurrentActor } from '@/lib/supabase'
import { PageShell, StatusBadge, PaymentBadge, formatDate, formatDateTime, formatXOF, daysUntil } from '@/lib/ui'

const ALL_FEATURES = ['students', 'grades', 'reports', 'promotion', 'finance', 'payments', 'salary', 'expenses', 'bi']
const PAYMENT_METHODS = { especes: 'Espèces', mobile_money: 'Mobile Money', virement: 'Virement', autre: 'Autre' }

export default function SchoolDetailPage() {
  const { id } = useParams()
  const [school, setSchool] = useState(null)
  const [license, setLicense] = useState(null)
  const [payments, setPayments] = useState([])
  const [discounts, setDiscounts] = useState([])
  const [paymentSummary, setPaymentSummary] = useState(null)
  const [licenseHistory, setLicenseHistory] = useState([])
  const [syncHistory, setSyncHistory] = useState([])
  const [auditLog, setAuditLog] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchAll = useCallback(async () => {
    const supabase = getSupabase()

    const { data: schoolData } = await supabase.from('schools').select('*').eq('id', id).single()
    setSchool(schoolData)
    if (!schoolData) { setLoading(false); return }

    const [licRes, syncRes, auditRes] = await Promise.all([
      supabase.from('licenses').select('*').eq('school_id', id).order('created_at', { ascending: false }),
      supabase.from('sync_records').select('*').eq('school_id', id).order('synced_at', { ascending: false }).limit(10),
      supabase.from('cap_audit_logs').select('*').eq('entity_id', id).order('created_at', { ascending: false }).limit(15),
    ])

    const allLicenses = licRes.data || []
    const active = allLicenses.find(l => ['ACTIVE', 'PENDING_ACTIVATION', 'SUSPENDED'].includes(l.status))
    setLicense(active || allLicenses[0] || null)
    setLicenseHistory(allLicenses.filter(l => l.status === 'REVOKED'))
    setSyncHistory(syncRes.data || [])
    setAuditLog(auditRes.data || [])

    if (active) {
      const [payRes, discRes, summRes] = await Promise.all([
        supabase.from('license_payments').select('*').eq('license_id', active.id).order('payment_date', { ascending: false }),
        supabase.from('license_discounts').select('*').eq('license_id', active.id).order('created_at', { ascending: false }),
        supabase.from('license_payment_summary').select('*').eq('license_id', active.id).single(),
      ])
      setPayments(payRes.data || [])
      setDiscounts(discRes.data || [])
      setPaymentSummary(summRes.data || null)
    }

    setLoading(false)
  }, [id])

  useEffect(() => { fetchAll() }, [fetchAll])

  // ─── State ───────────────────────────────────────────────
  const [toggling, setToggling] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [showPaymentForm, setShowPaymentForm] = useState(false)
  const [payForm, setPayForm] = useState({ amount: '', payment_method: 'especes', reference_number: '', notes: '' })
  const [savingPay, setSavingPay] = useState(false)
  const [showDiscountForm, setShowDiscountForm] = useState(false)
  const [discountForm, setDiscountForm] = useState({ amount: '', reason: '' })
  const [savingDiscount, setSavingDiscount] = useState(false)
  const [editingSchool, setEditingSchool] = useState(false)
  const [schoolForm, setSchoolForm] = useState({})
  const [editingFeatures, setEditingFeatures] = useState(false)
  const [featureForm, setFeatureForm] = useState([])
  const [savingFeatures, setSavingFeatures] = useState(false)
  const [editingLicenseField, setEditingLicenseField] = useState(null)
  const [licenseFieldValue, setLicenseFieldValue] = useState('')
  const [showRenewModal, setShowRenewModal] = useState(false)
  const [renewKey, setRenewKey] = useState(null)
  const [showReissueConfirm, setShowReissueConfirm] = useState(false)
  const [reissuing, setReissuing] = useState(false)
  const [resetCode, setResetCode] = useState(null)
  const [fetchingResetCode, setFetchingResetCode] = useState(false)

  // ─── Actions ───────────────────────────────────────────────
  async function toggleLicense() {
    if (!license) return
    setToggling(true)
    const supabase = getSupabase()
    const newStatus = license.status === 'SUSPENDED' ? 'ACTIVE' : 'SUSPENDED'
    await supabase.from('licenses').update({ status: newStatus, is_active: newStatus === 'ACTIVE' }).eq('id', license.id)
    await supabase.from('cap_audit_logs').insert({
      actor: await getCurrentActor(), action: newStatus === 'SUSPENDED' ? 'LICENSE_SUSPENDED' : 'LICENSE_REACTIVATED',
      entity_type: 'school', entity_id: id, old_values: { status: license.status }, new_values: { status: newStatus },
    })
    setToggling(false)
    fetchAll()
  }

  async function resetHardware() {
    if (!license?.hardware_fingerprint) return
    setResetting(true)
    const supabase = getSupabase()
    await supabase.from('licenses').update({ hardware_fingerprint: null, hardware_bound_at: null, status: 'PENDING_ACTIVATION' }).eq('id', license.id)
    await supabase.from('cap_audit_logs').insert({
      actor: await getCurrentActor(), action: 'HARDWARE_RESET', entity_type: 'school', entity_id: id,
      old_values: { fingerprint: license.hardware_fingerprint },
    })
    setResetting(false)
    fetchAll()
  }

  async function addPayment(e) {
    e.preventDefault()
    setSavingPay(true)
    const supabase = getSupabase()
    const amount = parseInt(payForm.amount)
    const actor = await getCurrentActor()
    await supabase.from('license_payments').insert({
      license_id: license.id, school_id: id, amount,
      payment_method: payForm.payment_method, reference_number: payForm.reference_number || null, notes: payForm.notes || null,
      recorded_by: actor,
    })

    const newPaidCount = license.rate_per_student > 0
      ? Math.floor((license.amount_paid + amount) / license.rate_per_student)
      : license.paid_student_count
    await supabase.from('licenses').update({
      amount_paid: license.amount_paid + amount,
      paid_student_count: Math.min(newPaidCount, license.allowed_students),
    }).eq('id', license.id)

    await supabase.from('cap_audit_logs').insert({
      actor, action: 'PAYMENT_RECORDED', entity_type: 'school', entity_id: id,
      new_values: { amount, method: payForm.payment_method },
    })
    setSavingPay(false)
    setShowPaymentForm(false)
    setPayForm({ amount: '', payment_method: 'especes', reference_number: '', notes: '' })
    fetchAll()
  }

  async function addDiscount(e) {
    e.preventDefault()
    setSavingDiscount(true)
    const supabase = getSupabase()
    const actor = await getCurrentActor()
    await supabase.from('license_discounts').insert({
      license_id: license.id, school_id: id,
      amount: parseInt(discountForm.amount), reason: discountForm.reason.trim(),
      granted_by: actor,
    })
    await supabase.from('cap_audit_logs').insert({
      actor, action: 'DISCOUNT_GRANTED', entity_type: 'school', entity_id: id,
      new_values: { amount: discountForm.amount, reason: discountForm.reason },
    })
    setSavingDiscount(false)
    setShowDiscountForm(false)
    setDiscountForm({ amount: '', reason: '' })
    fetchAll()
  }

  async function saveLicenseField(field) {
    const supabase = getSupabase()
    const value = parseInt(licenseFieldValue)
    if (isNaN(value) || value < 0) { setEditingLicenseField(null); return }
    const old = license[field]
    await supabase.from('licenses').update({ [field]: value }).eq('id', license.id)
    await supabase.from('cap_audit_logs').insert({
      actor: await getCurrentActor(), action: 'LICENSE_FIELD_UPDATED', entity_type: 'school', entity_id: id,
      old_values: { [field]: old }, new_values: { [field]: value },
    })
    setEditingLicenseField(null)
    fetchAll()
  }

  async function saveSchoolInfo(e) {
    e.preventDefault()
    const supabase = getSupabase()
    await supabase.from('schools').update(schoolForm).eq('id', id)
    await supabase.from('cap_audit_logs').insert({
      actor: await getCurrentActor(), action: 'SCHOOL_UPDATED', entity_type: 'school', entity_id: id, new_values: schoolForm,
    })
    setEditingSchool(false)
    fetchAll()
  }

  useEffect(() => {
    if (license?.features) setFeatureForm([...license.features])
  }, [license])

  async function saveFeatures() {
    if (!license) return
    setSavingFeatures(true)
    const supabase = getSupabase()
    await supabase.from('licenses').update({ features: featureForm }).eq('id', license.id)
    await supabase.from('cap_audit_logs').insert({
      actor: await getCurrentActor(), action: 'FEATURES_UPDATED', entity_type: 'school', entity_id: id,
      old_values: { features: license.features }, new_values: { features: featureForm },
    })
    setSavingFeatures(false)
    setEditingFeatures(false)
    fetchAll()
  }

  async function handleRenewal(renewForm) {
    const supabase = getSupabase()
    await supabase.from('licenses').update({ status: 'REVOKED', is_active: false }).eq('id', license.id)

    const { data: keyData } = await supabase.rpc('generate_license_key')
    if (!keyData?.[0]) return
    const { plain_key, key_hash, key_preview } = keyData[0]
    const { data: expiryDate } = await supabase.rpc('compute_expiry_date')

    await supabase.from('licenses').insert({
      school_id: id,
      license_key_hash: key_hash,
      license_key_preview: key_preview,
      tier: renewForm.tier || license.tier,
      rate_per_student: renewForm.rate_per_student || license.rate_per_student,
      declared_student_count: renewForm.declared_student_count || license.declared_student_count,
      paid_student_count: 0,
      allowed_students: renewForm.declared_student_count || license.declared_student_count,
      amount_paid: 0,
      installation_fee: 0,
      installation_fee_paid: true,
      semesters_active: renewForm.semesters_active || license.semesters_active,
      features: renewForm.features || license.features,
      semester_1_deadline: license.semester_1_deadline,
      semester_2_deadline: license.semester_2_deadline,
      semester_3_deadline: license.semester_3_deadline,
      expiry_date: expiryDate,
    })

    await supabase.from('cap_audit_logs').insert({
      actor: await getCurrentActor(), action: 'LICENSE_RENEWED', entity_type: 'school', entity_id: id,
      old_values: { license_id: license.id }, new_values: { tier: renewForm.tier },
    })

    setRenewKey(plain_key)
    fetchAll()
  }

  // Lost-key / new-PC replacement: revoke the current key and issue a fresh
  // one for the SAME license period. Unlike renewal, everything commercial
  // (expiry, tier, rates, payments) carries forward unchanged.
  async function handleReissue() {
    if (!license) return
    setReissuing(true)
    const supabase = getSupabase()

    await supabase.from('licenses').update({ status: 'REVOKED', is_active: false }).eq('id', license.id)

    const { data: keyData } = await supabase.rpc('generate_license_key')
    if (!keyData?.[0]) { setReissuing(false); return }
    const { plain_key, key_hash, key_preview } = keyData[0]

    await supabase.from('licenses').insert({
      school_id: id,
      license_key_hash: key_hash,
      license_key_preview: key_preview,
      tier: license.tier,
      rate_per_student: license.rate_per_student,
      declared_student_count: license.declared_student_count,
      paid_student_count: license.paid_student_count,
      allowed_students: license.allowed_students,
      amount_paid: license.amount_paid,
      installation_fee: license.installation_fee,
      installation_fee_paid: license.installation_fee_paid,
      semesters_active: license.semesters_active,
      features: license.features,
      semester_1_deadline: license.semester_1_deadline,
      semester_2_deadline: license.semester_2_deadline,
      semester_3_deadline: license.semester_3_deadline,
      expiry_date: license.expiry_date,
    })

    await supabase.from('cap_audit_logs').insert({
      actor: await getCurrentActor(), action: 'LICENSE_REISSUED', entity_type: 'school', entity_id: id,
      old_values: { license_id: license.id, key_preview: license.license_key_preview },
      new_values: { key_preview },
    })

    setReissuing(false)
    setShowReissueConfirm(false)
    setRenewKey(plain_key)
    fetchAll()
  }

  // Day-code for the school's admin password reset — computed server-side
  // (the HMAC secret never reaches the browser), read to the school by phone.
  async function fetchResetCode() {
    setFetchingResetCode(true)
    const supabase = getSupabase()
    const { data: { session } } = await supabase.auth.getSession()
    try {
      const res = await fetch('/api/reset-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ school_code: school.school_code }),
      })
      const data = await res.json()
      if (res.ok) {
        setResetCode(data)
        await supabase.from('cap_audit_logs').insert({
          actor: await getCurrentActor(), action: 'RESET_CODE_ISSUED', entity_type: 'school', entity_id: id,
          new_values: { valid_on: data.valid_on },
        })
      }
    } catch (err) {
      console.error('reset-code', err)
    }
    setFetchingResetCode(false)
  }

  // ─── Render helpers ────────────────────────────────────────
  function EditableField({ label, field, value, suffix }) {
    const isEditing = editingLicenseField === field
    return (
      <div>
        <p className="text-steel-400 text-xs">{label}</p>
        {isEditing ? (
          <div className="flex items-center gap-1 mt-0.5">
            <input type="number" min="0" autoFocus value={licenseFieldValue}
              onChange={e => setLicenseFieldValue(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') saveLicenseField(field); if (e.key === 'Escape') setEditingLicenseField(null) }}
              className="w-24 px-2 py-1 border border-brand rounded text-sm focus:outline-none" />
            <button onClick={() => saveLicenseField(field)} className="text-xs text-brand font-medium">OK</button>
            <button onClick={() => setEditingLicenseField(null)} className="text-xs text-steel-400">×</button>
          </div>
        ) : (
          <p className="text-steel-800 cursor-pointer hover:text-brand transition-colors"
            onClick={() => { setEditingLicenseField(field); setLicenseFieldValue(String(value)) }}>
            {suffix ? `${value} ${suffix}` : formatXOF(value)}
            <span className="text-xs text-steel-300 ml-1">✎</span>
          </p>
        )}
      </div>
    )
  }

  if (loading) return <PageShell><div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" /></div></PageShell>
  if (!school) return <PageShell><p className="text-steel-500 py-20 text-center">École introuvable</p></PageShell>

  const expiryDays = daysUntil(license?.expiry_date)
  const actualCount = license?.student_count_sync || license?.declared_student_count || 0
  const overCount = license && actualCount > license.allowed_students

  return (
    <PageShell>
      <div className="max-w-3xl space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-xl font-medium text-steel-900">{school.school_name}</h1>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-sm font-mono text-steel-500">{school.school_code}</span>
            <span className="text-xs text-steel-400">Préfixe: {school.school_prefix}</span>
            {license && <StatusBadge status={license.status} />}
          </div>
          <p className="text-xs text-steel-400 mt-1">
            {school.director_name} · {school.phone || '—'} · {school.city}, {school.country} · Client depuis {formatDate(school.created_at)}
          </p>
        </div>

        {/* Over-count alert */}
        {overCount && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
            <svg className="w-5 h-5 text-red-500 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            <div>
              <p className="text-sm font-medium text-red-700">Dépassement d'élèves</p>
              <p className="text-xs text-red-600">{actualCount} élèves réels vs {license.allowed_students} autorisés. Ajustez le nombre autorisé ou facturez la différence.</p>
            </div>
          </div>
        )}

        {/* School Info */}
        <section className="bg-white rounded-xl border border-steel-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-semibold text-steel-400 uppercase tracking-wide">Informations</h2>
            {!editingSchool ? (
              <button onClick={() => { setEditingSchool(true); setSchoolForm({ school_name: school.school_name, director_name: school.director_name || '', phone: school.phone || '', city: school.city || '', country: school.country || '', notes: school.notes || '' }) }}
                className="text-xs text-brand hover:text-brand-600 font-medium">Modifier</button>
            ) : (
              <div className="flex gap-2">
                <button onClick={() => setEditingSchool(false)} className="text-xs text-steel-400 hover:text-steel-600">Annuler</button>
                <button onClick={saveSchoolInfo} className="text-xs text-brand font-medium">Enregistrer</button>
              </div>
            )}
          </div>
          {!editingSchool ? (
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div><p className="text-steel-400 text-xs">Directeur</p><p className="text-steel-800">{school.director_name || '—'}</p></div>
              <div><p className="text-steel-400 text-xs">Téléphone</p><p className="text-steel-800">{school.phone || '—'}</p></div>
              <div><p className="text-steel-400 text-xs">Ville</p><p className="text-steel-800">{school.city || '—'}</p></div>
              <div><p className="text-steel-400 text-xs">Pays</p><p className="text-steel-800">{school.country || '—'}</p></div>
              {school.notes && <div className="col-span-2"><p className="text-steel-400 text-xs">Notes</p><p className="text-steel-600 text-xs">{school.notes}</p></div>}
            </div>
          ) : (
            <form onSubmit={saveSchoolInfo} className="grid grid-cols-2 gap-3">
              {['school_name', 'director_name', 'phone', 'city', 'country'].map(f => (
                <div key={f}>
                  <input value={schoolForm[f] || ''} onChange={e => setSchoolForm(p => ({ ...p, [f]: e.target.value }))}
                    placeholder={f} className="w-full px-3 py-1.5 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand" />
                </div>
              ))}
              <div className="col-span-2">
                <textarea value={schoolForm.notes || ''} onChange={e => setSchoolForm(p => ({ ...p, notes: e.target.value }))}
                  placeholder="Notes" rows={2} className="w-full px-3 py-1.5 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand resize-none" />
              </div>
            </form>
          )}
        </section>

        {/* Current License + Pricing */}
        {license && (
          <section className="bg-white rounded-xl border border-steel-200 p-6">
            <h2 className="text-xs font-semibold text-steel-400 uppercase tracking-wide mb-4">Licence et tarification</h2>

            <div className="grid grid-cols-4 gap-4 text-sm">
              <div><p className="text-steel-400 text-xs">Clé (aperçu)</p><p className="text-steel-800 font-mono text-xs">{license.license_key_preview}</p></div>
              <div><p className="text-steel-400 text-xs">Plan</p><p className="text-steel-800 font-medium">
                <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${license.tier === 'PRO' ? 'bg-brand-50 text-brand-600' : 'bg-steel-100 text-steel-600'}`}>{license.tier}</span>
              </p></div>
              <div><p className="text-steel-400 text-xs">Trimestres</p><p className="text-steel-800">{license.semesters_active}/3</p></div>
              <div><p className="text-steel-400 text-xs">Expiration</p>
                <p className={`font-medium ${expiryDays !== null && expiryDays < 30 ? 'text-red-500' : 'text-steel-800'}`}>
                  {formatDate(license.expiry_date)} {expiryDays !== null && <span className="text-xs text-steel-400 ml-1">({expiryDays > 0 ? `${expiryDays}j` : 'expiré'})</span>}
                </p></div>
            </div>

            {/* Per-student pricing details — editable */}
            <div className="mt-4 pt-4 border-t border-steel-100">
              <p className="text-xs font-semibold text-steel-400 uppercase tracking-wide mb-3">Tarification par élève</p>
              <div className="grid grid-cols-4 gap-4 text-sm">
                <EditableField label="Tarif / élève" field="rate_per_student" value={license.rate_per_student} />
                <EditableField label="Élèves déclarés" field="declared_student_count" value={license.declared_student_count} suffix="élèves" />
                <EditableField label="Élèves autorisés" field="allowed_students" value={license.allowed_students} suffix="élèves" />
                <div>
                  <p className="text-steel-400 text-xs">Élèves réels (sync)</p>
                  <p className={`text-sm font-medium ${overCount ? 'text-red-500' : 'text-steel-800'}`}>
                    {license.student_count_sync ?? '—'}
                  </p>
                </div>
              </div>
            </div>

            {/* Installation fee */}
            <div className="mt-4 pt-4 border-t border-steel-100">
              <div className="grid grid-cols-4 gap-4 text-sm">
                <div><p className="text-steel-400 text-xs">Frais installation</p><p className="text-steel-800">{formatXOF(license.installation_fee)}</p></div>
                <div><p className="text-steel-400 text-xs">Installation payée</p>
                  <p className={`font-medium ${license.installation_fee_paid ? 'text-brand' : 'text-yellow-600'}`}>
                    {license.installation_fee_paid ? 'Oui' : 'Non'}
                  </p>
                </div>
                <div><p className="text-steel-400 text-xs">Activé le</p><p className="text-steel-800">{license.hardware_bound_at ? formatDateTime(license.hardware_bound_at) : 'Non activé'}</p></div>
                <div><p className="text-steel-400 text-xs">Ingénieur</p><p className="text-steel-800">{license.assigned_engineer || '—'}</p></div>
              </div>
            </div>

            {/* Deadlines */}
            {(license.semester_1_deadline || license.semester_2_deadline || license.semester_3_deadline) && (
              <div className="mt-4 pt-4 border-t border-steel-100">
                <p className="text-steel-400 text-xs mb-1">Deadlines</p>
                <div className="flex gap-3">
                  {[
                    { label: 'T1', month: license.semester_1_deadline },
                    { label: 'T2', month: license.semester_2_deadline },
                    { label: 'T3', month: license.semester_3_deadline },
                  ].filter(d => d.month).map(d => (
                    <span key={d.label} className="px-2 py-0.5 bg-steel-50 border border-steel-200 rounded text-xs text-steel-600">
                      {d.label}: {['Jan','Fév','Mar','Avr','Mai','Juin','Juil','Août','Sep','Oct','Nov','Déc'][d.month - 1]}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Features */}
            {license.features?.length > 0 && (
              <div className="mt-4 pt-4 border-t border-steel-100">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-steel-400 text-xs">Fonctionnalités</p>
                  <button onClick={() => setEditingFeatures(!editingFeatures)}
                    className="text-xs text-brand hover:text-brand-600 font-medium">
                    {editingFeatures ? 'Annuler' : 'Modifier'}
                  </button>
                </div>
                {!editingFeatures ? (
                  <div className="flex flex-wrap gap-1">{license.features.map(f => <span key={f} className="px-2 py-0.5 bg-steel-100 text-steel-600 rounded text-xs">{f}</span>)}</div>
                ) : (
                  <div>
                    <div className="grid grid-cols-3 gap-1.5 mb-2">
                      {ALL_FEATURES.map(f => (
                        <label key={f} className="flex items-center gap-1.5 text-xs text-steel-600 cursor-pointer">
                          <input type="checkbox" checked={featureForm.includes(f)} onChange={() => {
                            setFeatureForm(prev => prev.includes(f) ? prev.filter(x => x !== f) : [...prev, f])
                          }} className="rounded border-steel-300 text-brand focus:ring-brand" />
                          {f}
                        </label>
                      ))}
                    </div>
                    <button onClick={saveFeatures} disabled={savingFeatures}
                      className="px-3 py-1.5 bg-brand hover:bg-brand-600 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition-colors">
                      {savingFeatures ? 'Enregistrement...' : 'Enregistrer'}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Hardware */}
            <div className="mt-4 pt-4 border-t border-steel-100">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-steel-400">Matériel lié</p>
                {license.hardware_fingerprint && (
                  <button onClick={resetHardware} disabled={resetting}
                    className="text-xs text-red-500 hover:text-red-600 font-medium disabled:opacity-50">
                    {resetting ? 'Réinitialisation...' : 'Réinitialiser le matériel'}
                  </button>
                )}
              </div>
              {license.hardware_fingerprint ? (
                <div>
                  <p className="font-mono text-xs text-steel-600 break-all">{license.hardware_fingerprint}</p>
                  <p className="text-xs text-steel-400 mt-1">Lié le {formatDateTime(license.hardware_bound_at)}</p>
                </div>
              ) : (
                <p className="text-sm text-steel-400">Aucun — en attente d'activation</p>
              )}
            </div>

            {/* Actions */}
            <div className="mt-4 pt-4 border-t border-steel-100 flex gap-3">
              <button onClick={toggleLicense} disabled={toggling}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ${
                  license.status === 'SUSPENDED' ? 'bg-brand hover:bg-brand-600 text-white' : 'bg-red-50 text-red-600 hover:bg-red-100 border border-red-200'
                }`}>
                {toggling ? '...' : license.status === 'SUSPENDED' ? 'Réactiver' : 'Suspendre'}
              </button>
              <button onClick={() => setShowRenewModal(true)}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-yellow-50 text-yellow-700 hover:bg-yellow-100 border border-yellow-200 transition-colors">
                Générer un renouvellement
              </button>
              <button onClick={() => setShowReissueConfirm(true)}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 transition-colors">
                Nouvelle clé (même année)
              </button>
              <button onClick={fetchResetCode} disabled={fetchingResetCode}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-steel-50 text-steel-700 hover:bg-steel-100 border border-steel-200 transition-colors disabled:opacity-50">
                {fetchingResetCode ? '...' : 'Code de réinitialisation (admin)'}
              </button>
            </div>
          </section>
        )}

        {/* Financial Summary + Payments */}
        <section className="bg-white rounded-xl border border-steel-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-semibold text-steel-400 uppercase tracking-wide">Paiements</h2>
            <div className="flex gap-2">
              <button onClick={() => { setShowDiscountForm(!showDiscountForm); setShowPaymentForm(false) }}
                className="text-xs text-yellow-600 hover:text-yellow-700 font-medium">{showDiscountForm ? 'Annuler' : '+ Remise'}</button>
              <button onClick={() => { setShowPaymentForm(!showPaymentForm); setShowDiscountForm(false) }}
                className="text-xs text-brand hover:text-brand-600 font-medium">{showPaymentForm ? 'Annuler' : '+ Paiement'}</button>
            </div>
          </div>

          {/* Summary cards */}
          {paymentSummary && (
            <div className="grid grid-cols-5 gap-3 mb-4 text-sm">
              <div><p className="text-steel-400 text-xs">Total dû</p><p className="text-steel-800 font-medium">{formatXOF(paymentSummary.total_due)}</p></div>
              <div><p className="text-steel-400 text-xs">Payé</p><p className="text-brand font-medium">{formatXOF(paymentSummary.total_paid)}</p></div>
              <div><p className="text-steel-400 text-xs">Remises</p><p className="text-yellow-600 font-medium">{formatXOF(paymentSummary.total_discount)}</p></div>
              <div><p className="text-steel-400 text-xs">Solde restant</p>
                <p className={`font-medium ${paymentSummary.remaining > 0 ? 'text-red-500' : 'text-brand'}`}>{formatXOF(paymentSummary.remaining)}</p></div>
              <div><p className="text-steel-400 text-xs">Statut</p><PaymentBadge status={paymentSummary.payment_status} /></div>
            </div>
          )}

          {/* Payment form */}
          {showPaymentForm && (
            <form onSubmit={addPayment} className="bg-steel-50 rounded-lg p-4 mb-4 grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-steel-500 mb-1">Montant <span className="text-red-500">*</span></label>
                <input type="number" required min="1" value={payForm.amount} onChange={e => setPayForm(p => ({ ...p, amount: e.target.value }))}
                  className="w-full px-3 py-1.5 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand" />
              </div>
              <div>
                <label className="block text-xs text-steel-500 mb-1">Méthode <span className="text-red-500">*</span></label>
                <select value={payForm.payment_method} onChange={e => setPayForm(p => ({ ...p, payment_method: e.target.value }))}
                  className="w-full px-3 py-1.5 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand bg-white">
                  {Object.entries(PAYMENT_METHODS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <input value={payForm.reference_number} onChange={e => setPayForm(p => ({ ...p, reference_number: e.target.value }))} placeholder="Référence"
                  className="w-full px-3 py-1.5 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand" />
              </div>
              <div>
                <input value={payForm.notes} onChange={e => setPayForm(p => ({ ...p, notes: e.target.value }))} placeholder="Notes"
                  className="w-full px-3 py-1.5 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand" />
              </div>
              <div className="col-span-2">
                <button type="submit" disabled={savingPay || !payForm.amount}
                  className="px-4 py-2 bg-brand hover:bg-brand-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors">
                  {savingPay ? 'Enregistrement...' : 'Enregistrer le paiement'}
                </button>
              </div>
            </form>
          )}

          {/* Discount form */}
          {showDiscountForm && (
            <form onSubmit={addDiscount} className="bg-yellow-50 rounded-lg p-4 mb-4 grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-steel-500 mb-1">Montant <span className="text-red-500">*</span></label>
                <input type="number" required min="1" value={discountForm.amount} onChange={e => setDiscountForm(p => ({ ...p, amount: e.target.value }))}
                  className="w-full px-3 py-1.5 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand" />
              </div>
              <div>
                <label className="block text-xs text-steel-500 mb-1">Raison <span className="text-red-500">*</span></label>
                <input type="text" required value={discountForm.reason} onChange={e => setDiscountForm(p => ({ ...p, reason: e.target.value }))}
                  placeholder="Ex: école rurale, fidélité..."
                  className="w-full px-3 py-1.5 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand" />
              </div>
              <div className="col-span-2">
                <button type="submit" disabled={savingDiscount || !discountForm.amount || !discountForm.reason.trim()}
                  className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors">
                  {savingDiscount ? 'Enregistrement...' : 'Accorder la remise'}
                </button>
              </div>
            </form>
          )}

          {/* Payment history */}
          {payments.length > 0 ? (
            <table className="w-full text-xs">
              <thead><tr className="border-b border-steel-200">
                <th className="text-left py-2 text-steel-400 font-medium">Date</th>
                <th className="text-right py-2 text-steel-400 font-medium">Montant</th>
                <th className="text-left py-2 text-steel-400 font-medium">Méthode</th>
                <th className="text-left py-2 text-steel-400 font-medium">Référence</th>
                <th className="text-left py-2 text-steel-400 font-medium">Notes</th>
              </tr></thead>
              <tbody>{payments.map(p => (
                <tr key={p.id} className="border-b border-steel-100">
                  <td className="py-2 text-steel-700">{formatDate(p.payment_date)}</td>
                  <td className="py-2 text-steel-800 text-right font-medium">{formatXOF(p.amount)}</td>
                  <td className="py-2 text-steel-600">{PAYMENT_METHODS[p.payment_method] || p.payment_method}</td>
                  <td className="py-2 text-steel-600">{p.reference_number || '—'}</td>
                  <td className="py-2 text-steel-500">{p.notes || '—'}</td>
                </tr>
              ))}</tbody>
            </table>
          ) : <p className="text-sm text-steel-400 text-center py-4">Aucun paiement enregistré</p>}

          {/* Discount history */}
          {discounts.length > 0 && (
            <div className="mt-4 pt-4 border-t border-steel-100">
              <p className="text-xs font-semibold text-steel-400 uppercase tracking-wide mb-2">Remises accordées</p>
              <table className="w-full text-xs">
                <thead><tr className="border-b border-steel-200">
                  <th className="text-left py-2 text-steel-400 font-medium">Date</th>
                  <th className="text-right py-2 text-steel-400 font-medium">Montant</th>
                  <th className="text-left py-2 text-steel-400 font-medium">Raison</th>
                </tr></thead>
                <tbody>{discounts.map(d => (
                  <tr key={d.id} className="border-b border-steel-100">
                    <td className="py-2 text-steel-700">{formatDate(d.created_at)}</td>
                    <td className="py-2 text-yellow-600 text-right font-medium">-{formatXOF(d.amount)}</td>
                    <td className="py-2 text-steel-600">{d.reason}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </section>

        {/* License History */}
        {licenseHistory.length > 0 && (
          <section className="bg-white rounded-xl border border-steel-200 p-6">
            <h2 className="text-xs font-semibold text-steel-400 uppercase tracking-wide mb-4">Historique des licences</h2>
            <table className="w-full text-xs">
              <thead><tr className="border-b border-steel-200">
                <th className="text-left py-2 text-steel-400 font-medium">Période</th>
                <th className="text-left py-2 text-steel-400 font-medium">Plan</th>
                <th className="text-right py-2 text-steel-400 font-medium">Élèves</th>
                <th className="text-right py-2 text-steel-400 font-medium">Tarif</th>
                <th className="text-left py-2 text-steel-400 font-medium">Statut</th>
              </tr></thead>
              <tbody>{licenseHistory.map(l => (
                <tr key={l.id} className="border-b border-steel-100">
                  <td className="py-2 text-steel-700">{formatDate(l.created_at)} → {formatDate(l.expiry_date)}</td>
                  <td className="py-2 text-steel-600">{l.tier}</td>
                  <td className="py-2 text-steel-800 text-right">{l.declared_student_count}</td>
                  <td className="py-2 text-steel-800 text-right">{formatXOF(l.rate_per_student)}/élève</td>
                  <td className="py-2"><StatusBadge status={l.status} /></td>
                </tr>
              ))}</tbody>
            </table>
          </section>
        )}

        {/* Sync History */}
        <section className="bg-white rounded-xl border border-steel-200 p-6">
          <h2 className="text-xs font-semibold text-steel-400 uppercase tracking-wide mb-4">Synchronisations</h2>
          {license?.last_sync_at && (
            <div className="flex gap-6 mb-4 text-sm">
              <div><p className="text-steel-400 text-xs">Dernière sync</p><p className="text-steel-800">{formatDateTime(license.last_sync_at)}</p></div>
              {license.student_count_sync != null && <div><p className="text-steel-400 text-xs">Élèves réels</p><p className="text-steel-800">{license.student_count_sync}</p></div>}
            </div>
          )}
          {syncHistory.length > 0 ? (
            <table className="w-full text-xs">
              <thead><tr className="border-b border-steel-200">
                <th className="text-left py-2 text-steel-400 font-medium">Date</th>
                <th className="text-left py-2 text-steel-400 font-medium">Type</th>
                <th className="text-left py-2 text-steel-400 font-medium">Statut</th>
                <th className="text-right py-2 text-steel-400 font-medium">Records</th>
                <th className="text-right py-2 text-steel-400 font-medium">Élèves</th>
              </tr></thead>
              <tbody>{syncHistory.map(s => (
                <tr key={s.id} className="border-b border-steel-100">
                  <td className="py-2 text-steel-700">{formatDateTime(s.synced_at)}</td>
                  <td className="py-2 text-steel-600">{s.sync_type}</td>
                  <td className="py-2"><span className={`px-1.5 py-0.5 rounded text-xs font-medium ${s.status === 'success' ? 'bg-brand-50 text-brand-600' : s.status === 'failed' ? 'bg-red-100 text-red-600' : 'bg-yellow-100 text-yellow-700'}`}>{s.status}</span></td>
                  <td className="py-2 text-steel-800 text-right">{s.records_sent}</td>
                  <td className="py-2 text-steel-800 text-right">{s.actual_student_count ?? '—'}</td>
                </tr>
              ))}</tbody>
            </table>
          ) : <p className="text-sm text-steel-400 text-center py-4">Aucune synchronisation</p>}
        </section>

        {/* Audit Log */}
        <section className="bg-white rounded-xl border border-steel-200 p-6">
          <h2 className="text-xs font-semibold text-steel-400 uppercase tracking-wide mb-4">Journal d'audit</h2>
          {auditLog.length > 0 ? (
            <table className="w-full text-xs">
              <thead><tr className="border-b border-steel-200">
                <th className="text-left py-2 text-steel-400 font-medium">Date</th>
                <th className="text-left py-2 text-steel-400 font-medium">Acteur</th>
                <th className="text-left py-2 text-steel-400 font-medium">Action</th>
              </tr></thead>
              <tbody>{auditLog.map(a => (
                <tr key={a.id} className="border-b border-steel-100">
                  <td className="py-2 text-steel-700">{formatDateTime(a.created_at)}</td>
                  <td className="py-2 text-steel-600">{a.actor}</td>
                  <td className="py-2 text-steel-800">{a.action}</td>
                </tr>
              ))}</tbody>
            </table>
          ) : <p className="text-sm text-steel-400 text-center py-4">Aucune action enregistrée</p>}
        </section>
      </div>

      {/* Reset Code Modal */}
      {resetCode && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 text-center">
            <h2 className="text-base font-semibold text-steel-900 mb-1">Code de réinitialisation admin</h2>
            <p className="text-sm text-steel-500 mb-4">
              Réinitialise uniquement le mot de passe du compte <strong>administrateur</strong> — pas secrétaire ni comptable.
              À communiquer à l'école par téléphone. Valable uniquement le {resetCode.valid_on}, à usage unique.
            </p>
            <p className="font-mono text-2xl font-bold text-steel-900 tracking-widest bg-steel-50 rounded-lg py-4 mb-5 select-all">
              {resetCode.code}
            </p>
            <button onClick={() => setResetCode(null)}
              className="w-full py-2.5 bg-brand hover:bg-brand-600 text-white rounded-lg text-sm font-medium">
              Fermer
            </button>
          </div>
        </div>
      )}

      {/* Reissue Confirm Modal */}
      {showReissueConfirm && !renewKey && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <h2 className="text-base font-semibold text-steel-900 mb-1">Nouvelle clé (même année)</h2>
            <p className="text-sm text-steel-500 mb-4">
              La clé actuelle sera révoquée immédiatement et une nouvelle clé sera générée
              pour la même période de licence. Expiration, tarifs et paiements sont conservés.
            </p>
            <div className="bg-steel-50 rounded-lg px-4 py-3 mb-5 text-sm space-y-1">
              <p className="text-steel-700">Clé actuelle : <span className="font-mono text-xs">{license?.license_key_preview}</span></p>
              <p className="text-steel-500 text-xs">Expiration conservée : {license?.expiry_date}</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowReissueConfirm(false)} disabled={reissuing}
                className="flex-1 py-2.5 border border-steel-200 text-steel-600 rounded-lg text-sm font-medium hover:bg-steel-50 disabled:opacity-50">
                Annuler
              </button>
              <button onClick={handleReissue} disabled={reissuing}
                className="flex-1 py-2.5 bg-brand hover:bg-brand-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium">
                {reissuing ? 'Génération...' : 'Générer la clé'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Renewal Modal */}
      {showRenewModal && !renewKey && (
        <RenewModal currentLicense={license} onClose={() => setShowRenewModal(false)} onRenew={handleRenewal} />
      )}
      {renewKey && (
        <KeyRevealModal licenseKey={renewKey} onConfirm={() => { setRenewKey(null); setShowRenewModal(false) }} />
      )}
    </PageShell>
  )
}

// ─── Renewal Modal ───────────────────────────────────────────
function RenewModal({ currentLicense, onClose, onRenew }) {
  const [form, setForm] = useState({
    tier: currentLicense?.tier || 'STANDARD',
    rate_per_student: currentLicense?.rate_per_student || 2000,
    declared_student_count: currentLicense?.declared_student_count || 0,
    semesters_active: currentLicense?.semesters_active || 3,
    features: [...(currentLicense?.features || [])],
  })
  const [saving, setSaving] = useState(false)

  const projected = (parseInt(form.declared_student_count) || 0) * (parseInt(form.rate_per_student) || 0)

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    await onRenew(form)
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="p-6 border-b border-steel-200">
          <h2 className="text-lg font-medium text-steel-900">Renouvellement</h2>
          <p className="text-xs text-steel-500 mt-1">La licence actuelle sera révoquée. Pas de frais d'installation.</p>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-steel-500 mb-1">Licence</label>
              <div className="flex gap-2">
                {['STANDARD', 'PRO'].map(t => (
                  <button key={t} type="button" onClick={() => setForm(p => ({ ...p, tier: t }))}
                    className={`flex-1 py-2 rounded-lg border text-xs font-medium transition-colors ${form.tier === t ? 'border-brand bg-brand-50 text-brand-600' : 'border-steel-200 text-steel-500'}`}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs text-steel-500 mb-1">Trimestres</label>
              <div className="flex gap-2">
                {[1, 2, 3].map(n => (
                  <button key={n} type="button" onClick={() => setForm(p => ({ ...p, semesters_active: n }))}
                    className={`flex-1 py-2 rounded-lg border text-xs font-medium transition-colors ${form.semesters_active === n ? 'border-brand bg-brand-50 text-brand-600' : 'border-steel-200 text-steel-500'}`}>
                    {n}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-steel-500 mb-1">Élèves déclarés</label>
              <input type="number" min="1" value={form.declared_student_count}
                onChange={e => setForm(p => ({ ...p, declared_student_count: e.target.value }))}
                className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand" />
            </div>
            <div>
              <label className="block text-xs text-steel-500 mb-1">Tarif / élève</label>
              <input type="number" min="0" step="500" value={form.rate_per_student}
                onChange={e => setForm(p => ({ ...p, rate_per_student: e.target.value }))}
                className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand" />
            </div>
          </div>
          {projected > 0 && (
            <div className="bg-steel-50 rounded-lg p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-steel-500">Coût annuel projeté</span>
                <span className="text-steel-800 font-medium">{formatXOF(projected)}</span>
              </div>
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 border border-steel-200 text-steel-600 rounded-lg text-sm font-medium hover:bg-steel-50 transition-colors">Annuler</button>
            <button type="submit" disabled={saving} className="flex-1 py-2.5 bg-brand hover:bg-brand-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors">
              {saving ? 'Génération...' : 'Renouveler et générer la clé'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Key Reveal Modal ────────────────────────────────────────
function KeyRevealModal({ licenseKey, onConfirm }) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    try { await navigator.clipboard.writeText(licenseKey) } catch {}
    setCopied(true)
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-8 text-center">
        <div className="w-12 h-12 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-steel-900 mb-1">Nouvelle clé de licence</h2>
        <p className="text-sm text-steel-500 mb-6">Copiez-la maintenant. Elle ne sera plus affichée.</p>
        <div className="bg-steel-50 border border-steel-200 rounded-lg p-4 mb-6">
          <p className="text-xl font-mono font-bold text-steel-900 tracking-wider">{licenseKey}</p>
        </div>
        <div className="flex gap-3">
          <button onClick={handleCopy} className="flex-1 py-2.5 border border-steel-200 text-steel-600 rounded-lg text-sm font-medium hover:bg-steel-50 transition-colors">
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
