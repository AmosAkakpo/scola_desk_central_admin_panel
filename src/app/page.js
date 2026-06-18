'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabase } from '@/lib/supabase'

// ─── Pricing lookup (XOF) from CONTEXT.MD ───────────────────
const PRICING = {
  setup: { S: 25000, M: 40000, L: 60000 },
  annual: {
    STANDARD: { S: 45000, M: 70000, L: 100000 },
    PRO:      { S: 70000, M: 110000, L: 150000 },
  },
}

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

      <nav className="flex-1 p-3">
        <a href="/" className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-steel-700/50 text-steel-200 text-sm">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
          Écoles
        </a>
      </nav>

      <div className="p-3 border-t border-steel-700">
        <button
          onClick={onLogout}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-steel-400 hover:text-steel-200 hover:bg-steel-700/50 text-sm w-full transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          Déconnexion
        </button>
      </div>
    </aside>
  )
}

// ─── Add School Modal ────────────────────────────────────────
function AddSchoolModal({ open, onClose, onCreated }) {
  const [form, setForm] = useState({
    school_name: '', director_name: '', director_phone: '',
    director_email: '', city: '', address: '',
    tier: 'STANDARD', size: 'S', semesters_active: 3,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function update(field, value) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSaving(true)

    const supabase = getSupabase()

    // Generate school code
    const { data: codeResult, error: codeErr } = await supabase.rpc('generate_school_code')
    if (codeErr) {
      setError('Erreur de génération du code école')
      setSaving(false)
      return
    }

    const schoolCode = codeResult
    const setupFee = PRICING.setup[form.size]
    const annualFee = PRICING.annual[form.tier][form.size]
    const prorated = Math.round(annualFee * (form.semesters_active / 3))

    // Insert school
    const { data: school, error: schoolErr } = await supabase
      .from('schools')
      .insert({
        school_code: schoolCode,
        school_name: form.school_name.trim(),
        director_name: form.director_name.trim(),
        director_phone: form.director_phone.trim() || null,
        director_email: form.director_email.trim() || null,
        city: form.city.trim() || null,
        address: form.address.trim() || null,
      })
      .select('id')
      .single()

    if (schoolErr) {
      setError('Erreur lors de la création de l\'école')
      setSaving(false)
      return
    }

    // Insert license
    const { error: licErr } = await supabase
      .from('licenses')
      .insert({
        school_id: school.id,
        tier: form.tier,
        size: form.size,
        semesters_active: form.semesters_active,
        setup_fee: setupFee,
        annual_fee: annualFee,
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
      director_email: '', city: '', address: '',
      tier: 'STANDARD', size: 'S', semesters_active: 3,
    })
    onCreated()
    onClose()
  }

  if (!open) return null

  const setupFee = PRICING.setup[form.size]
  const annualFee = PRICING.annual[form.tier][form.size]
  const prorated = Math.round(annualFee * (form.semesters_active / 3))

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-steel-200">
          <h2 className="text-lg font-medium text-steel-900">Ajouter une école</h2>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* School info */}
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

          {/* License config */}
          <div className="grid grid-cols-3 gap-4">
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
              <span className="text-steel-800 font-medium">{setupFee.toLocaleString('fr-FR')} XOF</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-steel-500">Licence annuelle</span>
              <span className="text-steel-800 font-medium">{annualFee.toLocaleString('fr-FR')} XOF</span>
            </div>
            {form.semesters_active < 3 && (
              <div className="flex justify-between text-sm">
                <span className="text-steel-500">Prorata ({form.semesters_active}/3)</span>
                <span className="text-brand font-medium">{prorated.toLocaleString('fr-FR')} XOF</span>
              </div>
            )}
            <hr className="border-steel-200" />
            <div className="flex justify-between text-sm font-medium">
              <span className="text-steel-700">Total à percevoir</span>
              <span className="text-steel-900">{(setupFee + prorated).toLocaleString('fr-FR')} XOF</span>
            </div>
          </div>

          {error && <p className="text-red-500 text-sm">{error}</p>}

          <div className="flex gap-3 pt-2">
            <button
              type="button" onClick={onClose}
              className="flex-1 py-2.5 border border-steel-200 text-steel-600 rounded-lg text-sm font-medium hover:bg-steel-50 transition-colors"
            >
              Annuler
            </button>
            <button
              type="submit" disabled={saving}
              className="flex-1 py-2.5 bg-brand hover:bg-brand-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
            >
              {saving ? 'Création...' : 'Créer l\'école'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── School Detail Modal ─────────────────────────────────────
function SchoolDetail({ school, onClose, onUpdated }) {
  const [toggling, setToggling] = useState(false)

  if (!school) return null

  async function toggleActive() {
    setToggling(true)
    const supabase = getSupabase()
    const newActive = !school.licenses[0]?.is_active

    await supabase
      .from('licenses')
      .update({ is_active: newActive })
      .eq('school_id', school.id)

    if (newActive) {
      await supabase.from('schools').update({ status: 'active' }).eq('id', school.id)
    } else {
      await supabase.from('schools').update({ status: 'suspended' }).eq('id', school.id)
    }

    setToggling(false)
    onUpdated()
    onClose()
  }

  const license = school.licenses?.[0]
  const isActive = license?.is_active

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="p-6 border-b border-steel-200 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-medium text-steel-900">{school.school_name}</h2>
            <p className="text-sm text-steel-500 mt-0.5 font-mono">{school.school_code}</p>
          </div>
          <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[school.status]}`}>
            {STATUS_LABELS[school.status]}
          </span>
        </div>

        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
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
          </div>

          {license && (
            <>
              <hr className="border-steel-100" />
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-steel-400">Licence</p>
                  <p className="text-steel-800 font-medium">{license.tier} — {license.size}</p>
                </div>
                <div>
                  <p className="text-steel-400">Expiration</p>
                  <p className="text-steel-800">{new Date(license.expiry_date).toLocaleDateString('fr-FR')}</p>
                </div>
                <div>
                  <p className="text-steel-400">Installation</p>
                  <p className="text-steel-800">{license.setup_fee?.toLocaleString('fr-FR')} XOF</p>
                </div>
                <div>
                  <p className="text-steel-400">Licence annuelle</p>
                  <p className="text-steel-800">{(license.annual_fee_assigned || license.annual_fee)?.toLocaleString('fr-FR')} XOF</p>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="p-6 border-t border-steel-200 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 border border-steel-200 text-steel-600 rounded-lg text-sm font-medium hover:bg-steel-50 transition-colors"
          >
            Fermer
          </button>
          <button
            onClick={toggleActive}
            disabled={toggling}
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

      if (!session) {
        router.push('/login')
        return
      }

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

  const filtered = schools.filter(s =>
    s.school_name.toLowerCase().includes(search.toLowerCase()) ||
    s.school_code.toLowerCase().includes(search.toLowerCase()) ||
    s.director_name.toLowerCase().includes(search.toLowerCase())
  )

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
        {/* Header */}
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

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Total', value: stats.total, color: 'text-steel-900' },
            { label: 'Actifs', value: stats.active, color: 'text-brand' },
            { label: 'En attente', value: stats.pending, color: 'text-yellow-600' },
            { label: 'Suspendus', value: stats.suspended, color: 'text-red-500' },
          ].map(stat => (
            <div key={stat.label} className="bg-white rounded-xl border border-steel-200 p-4">
              <p className="text-sm text-steel-500">{stat.label}</p>
              <p className={`text-2xl font-medium mt-1 ${stat.color}`}>{stat.value}</p>
            </div>
          ))}
        </div>

        {/* Search */}
        <div className="mb-4">
          <input
            type="text"
            placeholder="Rechercher une école, un code ou un directeur..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full max-w-md px-3 py-2 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand"
          />
        </div>

        {/* Table */}
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
                    {schools.length === 0
                      ? 'Aucune école enregistrée'
                      : 'Aucun résultat pour cette recherche'}
                  </td>
                </tr>
              ) : (
                filtered.map(school => (
                  <tr
                    key={school.id}
                    onClick={() => setSelectedSchool(school)}
                    className="border-b border-steel-100 hover:bg-steel-50 cursor-pointer transition-colors"
                  >
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

      <AddSchoolModal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        onCreated={fetchSchools}
      />

      <SchoolDetail
        school={selectedSchool}
        onClose={() => setSelectedSchool(null)}
        onUpdated={fetchSchools}
      />
    </div>
  )
}
