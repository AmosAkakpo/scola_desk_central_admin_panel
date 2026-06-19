'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { getSupabase } from '@/lib/supabase'
import { PageShell, StatusBadge, PaymentBadge, formatDate, formatDateTime, formatXOF, daysUntil } from '@/lib/ui'

const ALL_FEATURES = ['students', 'grades', 'reports', 'promotion', 'finance', 'payments', 'salary', 'expenses', 'bi']

export default function SchoolDetailPage() {
  const { id } = useParams()
  const [school, setSchool] = useState(null)
  const [license, setLicense] = useState(null)
  const [payments, setPayments] = useState([])
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

    const [licRes, histRes, syncRes, auditRes] = await Promise.all([
      supabase.from('licenses').select('*').eq('school_id', id).order('created_at', { ascending: false }),
      supabase.from('sync_records').select('*').eq('school_id', id).order('synced_at', { ascending: false }).limit(10),
      supabase.from('cap_audit_logs').select('*').eq('entity_id', id).order('created_at', { ascending: false }).limit(15),
      supabase.from('license_payment_summary').select('*').eq('school_id', id),
    ])

    const allLicenses = licRes.data || []
    const active = allLicenses.find(l => ['ACTIVE', 'PENDING_ACTIVATION', 'SUSPENDED'].includes(l.status))
    setLicense(active || allLicenses[0] || null)
    setLicenseHistory(allLicenses.filter(l => l.status === 'REVOKED'))
    setSyncHistory(histRes.data || [])
    setAuditLog(syncRes.data || [])

    if (active) {
      const { data: payData } = await supabase.from('license_payments').select('*').eq('license_id', active.id).order('payment_date', { ascending: false })
      setPayments(payData || [])
      const summary = (auditRes.data || []).find(s => s.license_id === active.id)
      setPaymentSummary(summary || null)
    }

    setLoading(false)
  }, [id])

  useEffect(() => { fetchAll() }, [fetchAll])

  // ─── Actions ───────────────────────────────────────────────
  const [toggling, setToggling] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [showPaymentForm, setShowPaymentForm] = useState(false)
  const [payForm, setPayForm] = useState({ amount: '', payment_method: 'cash', payment_reference: '', notes: '' })
  const [savingPay, setSavingPay] = useState(false)
  const [editingSchool, setEditingSchool] = useState(false)
  const [schoolForm, setSchoolForm] = useState({})
  const [editingFeatures, setEditingFeatures] = useState(false)
  const [featureForm, setFeatureForm] = useState([])
  const [savingFeatures, setSavingFeatures] = useState(false)
  const [showRenewModal, setShowRenewModal] = useState(false)
  const [renewKey, setRenewKey] = useState(null)

  async function toggleLicense() {
    if (!license) return
    setToggling(true)
    const supabase = getSupabase()
    const newStatus = license.status === 'SUSPENDED' ? 'ACTIVE' : 'SUSPENDED'
    await supabase.from('licenses').update({ status: newStatus, is_active: newStatus === 'ACTIVE' }).eq('id', license.id)
    await supabase.from('cap_audit_logs').insert({
      actor: 'owner', action: newStatus === 'SUSPENDED' ? 'LICENSE_SUSPENDED' : 'LICENSE_REACTIVATED',
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
      actor: 'owner', action: 'HARDWARE_RESET', entity_type: 'school', entity_id: id,
      old_values: { fingerprint: license.hardware_fingerprint },
    })
    setResetting(false)
    fetchAll()
  }

  async function addPayment(e) {
    e.preventDefault()
    setSavingPay(true)
    const supabase = getSupabase()
    await supabase.from('license_payments').insert({
      license_id: license.id, school_id: id, amount: parseFloat(payForm.amount),
      payment_method: payForm.payment_method, payment_reference: payForm.payment_reference || null, notes: payForm.notes || null,
      recorded_by: 'owner',
    })
    await supabase.from('cap_audit_logs').insert({
      actor: 'owner', action: 'PAYMENT_RECORDED', entity_type: 'school', entity_id: id,
      new_values: { amount: payForm.amount, method: payForm.payment_method },
    })
    setSavingPay(false)
    setShowPaymentForm(false)
    setPayForm({ amount: '', payment_method: 'cash', payment_reference: '', notes: '' })
    fetchAll()
  }

  async function saveSchoolInfo(e) {
    e.preventDefault()
    const supabase = getSupabase()
    await supabase.from('schools').update(schoolForm).eq('id', id)
    await supabase.from('cap_audit_logs').insert({
      actor: 'owner', action: 'SCHOOL_UPDATED', entity_type: 'school', entity_id: id, new_values: schoolForm,
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
      actor: 'owner', action: 'FEATURES_UPDATED', entity_type: 'school', entity_id: id,
      old_values: { features: license.features }, new_values: { features: featureForm },
    })
    setSavingFeatures(false)
    setEditingFeatures(false)
    fetchAll()
  }

  async function handleRenewal(renewForm) {
    const supabase = getSupabase()

    // Revoke current license
    await supabase.from('licenses').update({ status: 'REVOKED', is_active: false }).eq('id', license.id)

    // Generate new key
    const { data: keyData } = await supabase.rpc('generate_license_key')
    if (!keyData?.[0]) return
    const { plain_key, key_hash, key_preview } = keyData[0]

    // Compute expiry
    const { data: expiryDate } = await supabase.rpc('compute_expiry_date')

    // Create new license
    await supabase.from('licenses').insert({
      school_id: id,
      license_key_hash: key_hash,
      license_key_preview: key_preview,
      tier: renewForm.tier || license.tier,
      size: renewForm.size || license.size,
      semesters_active: renewForm.semesters_active || license.semesters_active,
      total_fee_due: renewForm.total_fee_due || license.total_fee_due,
      features: renewForm.features || license.features,
      semester_1_deadline: license.semester_1_deadline,
      semester_2_deadline: license.semester_2_deadline,
      semester_3_deadline: license.semester_3_deadline,
      expiry_date: expiryDate,
    })

    await supabase.from('cap_audit_logs').insert({
      actor: 'owner', action: 'LICENSE_RENEWED', entity_type: 'school', entity_id: id,
      old_values: { license_id: license.id }, new_values: { tier: renewForm.tier, size: renewForm.size },
    })

    setRenewKey(plain_key)
    fetchAll()
  }

  if (loading) return <PageShell><div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" /></div></PageShell>
  if (!school) return <PageShell><p className="text-steel-500 py-20 text-center">École introuvable</p></PageShell>

  const expiryDays = daysUntil(license?.expiry_date)

  return (
    <PageShell>
      <div className="max-w-3xl space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-medium text-steel-900">{school.school_name}</h1>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-sm font-mono text-steel-500">{school.school_code}</span>
              {license && <StatusBadge status={license.status} />}
            </div>
            <p className="text-xs text-steel-400 mt-1">
              {school.director_name} · {school.phone || '—'} · {school.city} · Client depuis {formatDate(school.created_at)}
            </p>
          </div>
        </div>

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

        {/* Current License */}
        {license && (
          <section className="bg-white rounded-xl border border-steel-200 p-6">
            <h2 className="text-xs font-semibold text-steel-400 uppercase tracking-wide mb-4">Licence actuelle</h2>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div><p className="text-steel-400 text-xs">Clé (aperçu)</p><p className="text-steel-800 font-mono">{license.license_key_preview}</p></div>
              <div><p className="text-steel-400 text-xs">Plan</p><p className="text-steel-800 font-medium">
                <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium mr-1 ${license.tier === 'PRO' ? 'bg-brand-50 text-brand-600' : 'bg-steel-100 text-steel-600'}`}>{license.tier}</span>
                {license.size}</p></div>
              <div><p className="text-steel-400 text-xs">Trimestres</p><p className="text-steel-800">{license.semesters_active}/3</p></div>
              <div><p className="text-steel-400 text-xs">Expiration</p>
                <p className={`font-medium ${expiryDays !== null && expiryDays < 30 ? 'text-red-500' : 'text-steel-800'}`}>
                  {formatDate(license.expiry_date)} {expiryDays !== null && <span className="text-xs text-steel-400 ml-1">({expiryDays > 0 ? `${expiryDays}j` : 'expiré'})</span>}
                </p></div>
              <div><p className="text-steel-400 text-xs">Activé le</p><p className="text-steel-800">{license.hardware_bound_at ? formatDateTime(license.hardware_bound_at) : 'Non activé'}</p></div>
              <div><p className="text-steel-400 text-xs">Statut</p><p className={`font-medium ${license.is_active ? 'text-brand' : 'text-red-500'}`}>{license.is_active ? 'Active' : 'Suspendue'}</p></div>

              {/* Semester Deadlines */}
              {(license.semester_1_deadline || license.semester_2_deadline || license.semester_3_deadline) && (
                <div className="col-span-3">
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

              {/* Features with edit */}
              {license.features?.length > 0 && (
                <div className="col-span-3">
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
                        {savingFeatures ? 'Enregistrement...' : 'Enregistrer les fonctionnalités'}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

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
                <div className="text-sm">
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
            </div>
          </section>
        )}

        {/* Payments */}
        <section className="bg-white rounded-xl border border-steel-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-semibold text-steel-400 uppercase tracking-wide">Paiements (licence actuelle)</h2>
            <button onClick={() => setShowPaymentForm(!showPaymentForm)}
              className="text-xs text-brand hover:text-brand-600 font-medium">{showPaymentForm ? 'Annuler' : '+ Ajouter un paiement'}</button>
          </div>

          {paymentSummary && (
            <div className="grid grid-cols-4 gap-3 mb-4 text-sm">
              <div><p className="text-steel-400 text-xs">Total dû</p><p className="text-steel-800 font-medium">{formatXOF(paymentSummary.total_fee_due)}</p></div>
              <div><p className="text-steel-400 text-xs">Payé</p><p className="text-brand font-medium">{formatXOF(paymentSummary.total_paid)}</p></div>
              <div><p className="text-steel-400 text-xs">Solde</p><p className={`font-medium ${paymentSummary.balance > 0 ? 'text-red-500' : 'text-brand'}`}>{formatXOF(paymentSummary.balance)}</p></div>
              <div><p className="text-steel-400 text-xs">Statut</p><PaymentBadge status={paymentSummary.payment_status} /></div>
            </div>
          )}

          {showPaymentForm && (
            <form onSubmit={addPayment} className="bg-steel-50 rounded-lg p-4 mb-4 grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-steel-500 mb-1">Montant <span className="text-red-500">*</span></label>
                <input type="number" required value={payForm.amount} onChange={e => setPayForm(p => ({ ...p, amount: e.target.value }))}
                  className="w-full px-3 py-1.5 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand" />
              </div>
              <div>
                <label className="block text-xs text-steel-500 mb-1">Méthode <span className="text-red-500">*</span></label>
                <select value={payForm.payment_method} onChange={e => setPayForm(p => ({ ...p, payment_method: e.target.value }))}
                  className="w-full px-3 py-1.5 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand bg-white">
                  <option value="cash">Espèces</option><option value="mobile_money">Mobile Money</option>
                  <option value="bank_transfer">Virement</option><option value="other">Autre</option>
                </select>
              </div>
              <div><input value={payForm.payment_reference} onChange={e => setPayForm(p => ({ ...p, payment_reference: e.target.value }))} placeholder="Référence"
                className="w-full px-3 py-1.5 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand" /></div>
              <div><input value={payForm.notes} onChange={e => setPayForm(p => ({ ...p, notes: e.target.value }))} placeholder="Notes"
                className="w-full px-3 py-1.5 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand" /></div>
              <div className="col-span-2">
                <button type="submit" disabled={savingPay || !payForm.amount}
                  className="px-4 py-2 bg-brand hover:bg-brand-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors">
                  {savingPay ? 'Enregistrement...' : 'Enregistrer le paiement'}
                </button>
              </div>
            </form>
          )}

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
                  <td className="py-2 text-steel-600">{p.payment_method}</td>
                  <td className="py-2 text-steel-600">{p.payment_reference || '—'}</td>
                  <td className="py-2 text-steel-500">{p.notes || '—'}</td>
                </tr>
              ))}</tbody>
            </table>
          ) : <p className="text-sm text-steel-400 text-center py-4">Aucun paiement enregistré</p>}
        </section>

        {/* License History */}
        {licenseHistory.length > 0 && (
          <section className="bg-white rounded-xl border border-steel-200 p-6">
            <h2 className="text-xs font-semibold text-steel-400 uppercase tracking-wide mb-4">Historique des licences</h2>
            <table className="w-full text-xs">
              <thead><tr className="border-b border-steel-200">
                <th className="text-left py-2 text-steel-400 font-medium">Période</th>
                <th className="text-left py-2 text-steel-400 font-medium">Plan</th>
                <th className="text-right py-2 text-steel-400 font-medium">Montant</th>
                <th className="text-left py-2 text-steel-400 font-medium">Statut</th>
              </tr></thead>
              <tbody>{licenseHistory.map(l => (
                <tr key={l.id} className="border-b border-steel-100">
                  <td className="py-2 text-steel-700">{formatDate(l.created_at)} → {formatDate(l.expiry_date)}</td>
                  <td className="py-2 text-steel-600">{l.tier} {l.size}</td>
                  <td className="py-2 text-steel-800 text-right">{formatXOF(l.total_fee_due)}</td>
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
              {license.student_count_sync && <div><p className="text-steel-400 text-xs">Élèves</p><p className="text-steel-800">{license.student_count_sync}</p></div>}
            </div>
          )}
          {syncHistory.length > 0 ? (
            <table className="w-full text-xs">
              <thead><tr className="border-b border-steel-200">
                <th className="text-left py-2 text-steel-400 font-medium">Date</th>
                <th className="text-left py-2 text-steel-400 font-medium">Type</th>
                <th className="text-left py-2 text-steel-400 font-medium">Statut</th>
                <th className="text-right py-2 text-steel-400 font-medium">Records</th>
              </tr></thead>
              <tbody>{syncHistory.map(s => (
                <tr key={s.id} className="border-b border-steel-100">
                  <td className="py-2 text-steel-700">{formatDateTime(s.synced_at)}</td>
                  <td className="py-2 text-steel-600">{s.sync_type}</td>
                  <td className="py-2"><span className={`px-1.5 py-0.5 rounded text-xs font-medium ${s.status === 'success' ? 'bg-brand-50 text-brand-600' : s.status === 'failed' ? 'bg-red-100 text-red-600' : 'bg-yellow-100 text-yellow-700'}`}>{s.status}</span></td>
                  <td className="py-2 text-steel-800 text-right">{s.records_sent}</td>
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

      {/* Renewal Modal */}
      {showRenewModal && !renewKey && (
        <RenewModal
          currentLicense={license}
          onClose={() => setShowRenewModal(false)}
          onRenew={handleRenewal}
        />
      )}

      {/* Key Reveal Modal (after renewal) */}
      {renewKey && (
        <KeyRevealModal
          licenseKey={renewKey}
          onConfirm={() => { setRenewKey(null); setShowRenewModal(false) }}
        />
      )}
    </PageShell>
  )
}

// ─── Renewal Modal ───────────────────────────────────────────
function RenewModal({ currentLicense, onClose, onRenew }) {
  const [form, setForm] = useState({
    tier: currentLicense?.tier || 'STANDARD',
    size: currentLicense?.size || 'SMALL',
    semesters_active: currentLicense?.semesters_active || 3,
    total_fee_due: '',
    features: [...(currentLicense?.features || [])],
  })
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    await onRenew({
      ...form,
      total_fee_due: form.total_fee_due ? parseInt(form.total_fee_due) : currentLicense?.total_fee_due || 0,
    })
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="p-6 border-b border-steel-200">
          <h2 className="text-lg font-medium text-steel-900">Générer un renouvellement</h2>
          <p className="text-xs text-steel-500 mt-1">La licence actuelle sera révoquée et une nouvelle clé sera générée.</p>
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
              <label className="block text-xs text-steel-500 mb-1">Taille</label>
              <div className="flex gap-2">
                {['SMALL', 'MEDIUM', 'LARGE'].map(s => (
                  <button key={s} type="button" onClick={() => setForm(p => ({ ...p, size: s }))}
                    className={`flex-1 py-2 rounded-lg border text-xs font-medium transition-colors ${form.size === s ? 'border-brand bg-brand-50 text-brand-600' : 'border-steel-200 text-steel-500'}`}>
                    {s === 'SMALL' ? 'S' : s === 'MEDIUM' ? 'M' : 'L'}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div>
            <label className="block text-xs text-steel-500 mb-1">Montant à facturer</label>
            <input type="number" value={form.total_fee_due} onChange={e => setForm(p => ({ ...p, total_fee_due: e.target.value }))}
              placeholder={String(currentLicense?.total_fee_due || 0)}
              className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand" />
          </div>
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
