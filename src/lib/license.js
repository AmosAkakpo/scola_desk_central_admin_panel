import { createHmac, createHash } from 'node:crypto'

const PAYLOAD_SECRET = (process.env.LICENSE_PAYLOAD_SECRET || '').trim()

const STANDARD_FEATURES = ['students', 'grades', 'reports', 'promotion']
const PRO_FEATURES = ['students', 'grades', 'reports', 'promotion', 'finance', 'payments', 'salary', 'expenses', 'bi']

export function verifySecret(request) {
  const secret = request.headers.get('x-scoladesk-secret')
  return secret === PAYLOAD_SECRET
}

export function hashKey(plainKey) {
  return createHash('sha256').update(plainKey).digest('hex')
}

export function signPayload(payload) {
  const json = JSON.stringify(payload)
  return createHmac('sha256', PAYLOAD_SECRET).update(json).digest('hex')
}

// One SQLCipher key per school, generated lazily on first activation and
// stable for the school's lifetime (renewals/reissues never change it).
// Escrowed in the schools row so support can recover a school whose local
// safeStorage copy is lost. Lazy-at-activation means schools created
// before migration 012 need no manual backfill -- one code path for all.
export async function ensureDbEncryptionKey(supabase, school) {
  if (school.db_encryption_key) return school.db_encryption_key
  const { randomBytes } = await import('node:crypto')
  const key = randomBytes(32).toString('hex')
  const { error } = await supabase
    .from('schools')
    .update({ db_encryption_key: key })
    .eq('id', school.id)
    .is('db_encryption_key', null) // never overwrite a concurrent write
  if (error) throw error
  // Re-read in case a concurrent activation won the race above.
  const { data } = await supabase.from('schools').select('db_encryption_key').eq('id', school.id).single()
  return data.db_encryption_key
}

// Shared by /api/activate (full activation, needs the license key) and
// /api/license-status (background check-in, key-less -- fingerprint match
// only) so a renewal/reissue/suspension looks identical to the local app
// regardless of which endpoint produced it.
export function buildLicensePayload(school, license, dbEncryptionKey) {
  const payload = {
    school_id: school.school_code,
    school_name: school.school_name,
    school_code: school.school_code,
    school_prefix: school.school_prefix,
    director_name: school.director_name,
    city: school.city,
    country: school.country,
    tier: license.tier,
    features: license.features?.length > 0 ? license.features : (license.tier === 'PRO' ? PRO_FEATURES : STANDARD_FEATURES),
    expiry_date: license.expiry_date,
    semesters_active: license.semesters_active,
    semester_deadlines: {
      t1: license.semester_1_deadline || null,
      t2: license.semester_2_deadline || null,
      t3: license.semester_3_deadline || null,
    },
    rate_per_student: license.rate_per_student,
    declared_student_count: license.declared_student_count,
    paid_student_count: license.paid_student_count,
    allowed_students: license.allowed_students,
    amount_paid: license.amount_paid,
    installation_fee: license.installation_fee,
    installation_fee_paid: license.installation_fee_paid,
    db_encryption_key: dbEncryptionKey,
    issued_at: new Date().toISOString(),
  }
  payload.signature = signPayload(payload)
  return payload
}
