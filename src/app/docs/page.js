'use client'

import { useState } from 'react'
import { PageShell } from '@/lib/ui'

// Each section: { id, title, items: [{ id, title, body }] }
// body is an array of paragraphs/blocks -- kept as plain JSX below rather
// than markdown, since this is a small, hand-maintained internal doc, not
// a CMS. Add a new item by copying an existing one; add a new section by
// copying a SECTIONS entry.
const SECTIONS = [
  {
    id: 'glossaire',
    title: 'Glossaire',
    items: [
      {
        id: 'termes',
        title: 'Termes courants',
        body: [
          <dl key="dl" className="space-y-3">
            {[
              ['school_code', "Identifiant unique de l'école (ex: BJ-2026-6C43). Généré à la création, ne change jamais."],
              ['school_prefix', "Court préfixe utilisé dans les matricules élèves (ex: 6C43). Dérivé du school_code."],
              ['matricule', "Numéro d'identification d'un élève ou enseignant, généré localement par l'app (mode 'custom') ou saisi manuellement (mode 'manual')."],
              ['hardware_fingerprint', "Empreinte unique du PC (basée sur composants matériels), liée à UNE licence à la fois. C'est ce qui empêche une clé d'être utilisée sur deux PC différents."],
              ['license_key', "Clé fournie à l'école pour activer l'app. Une seule active à la fois par école -- un renouvellement ou une réémission RÉVOQUE l'ancienne et en crée une nouvelle."],
              ['db_encryption_key', "Clé de chiffrement de la base de données locale de l'école. Générée une fois, stable à vie (les renouvellements de licence ne la changent JAMAIS). Escrowée dans Supabase pour recovery support."],
              ['CAP', "Ce panneau (Central Admin Panel) -- l'application que vous utilisez actuellement, déployée sur cap.scoladesk.com."],
              ['Année académique', "Toujours du 1er août au 31 juillet, dérivé automatiquement du libellé (ex: '2025-2026'). Règle fixe, non modifiable depuis 2026-07."],
            ].map(([term, def]) => (
              <div key={term}>
                <dt className="font-mono text-sm text-brand-600 font-medium">{term}</dt>
                <dd className="text-sm text-steel-600 mt-0.5">{def}</dd>
              </div>
            ))}
          </dl>,
        ],
      },
    ],
  },
  {
    id: 'donnees',
    title: 'Emplacement des données',
    items: [
      {
        id: 'chemins',
        title: 'Où se trouvent les fichiers',
        body: [
          <p key="p1">Sur le PC de l&apos;école (app installée via le setup officiel) :</p>,
          <pre key="pre1" className="bg-steel-800 text-steel-100 rounded-lg p-3 text-xs overflow-x-auto">
{`C:\\Users\\<utilisateur>\\AppData\\Roaming\\scola_desk_v1.0\\
  data\\
    scolaDesk.db        <- base de données chiffrée
    .dbkey               <- clé de chiffrement (protégée par Windows, inutile hors de ce compte)
    logos\\               <- logo de l'école uploadé
  logs\\
    main.log             <- journal de la session en cours
    main.log.old          <- journal de la session précédente`}
          </pre>,
          <p key="p2">Accès rapide : <kbd className="px-1.5 py-0.5 bg-steel-100 rounded text-xs font-mono">Win+R</kbd> puis taper <code className="bg-steel-100 px-1 rounded text-xs">%APPDATA%\scola_desk_v1.0</code>.</p>,
          <p key="p3" className="text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            Pour tester ou réinitialiser : <strong>renommer</strong> le dossier <code>data</code> (ex: en <code>data_BACKUP</code>) plutôt que le supprimer. Au prochain lancement, l&apos;app recrée un dossier vide et se comporte comme une install neuve. Rien n&apos;est perdu tant que l&apos;ancien dossier existe encore.
          </p>,
        ],
      },
    ],
  },
  {
    id: 'licence',
    title: 'Licence & Activation',
    items: [
      {
        id: 'renouvellement',
        title: 'Comment fonctionne un renouvellement',
        body: [
          <p key="p1">Un renouvellement (ou une réémission de clé) sur CAP <strong>révoque l&apos;ancienne clé</strong> et en génère une toute nouvelle -- ce n&apos;est jamais une mise à jour silencieuse de la clé existante.</p>,
          <p key="p2">L&apos;app locale détecte ça automatiquement (vérification en arrière-plan, une fois par jour pendant qu&apos;elle est en ligne) et passe en <strong>lecture seule</strong> avec une bannière rouge tant que la nouvelle clé n&apos;a pas été saisie dans Paramètres &gt; Licence. La détection prend jusqu&apos;à 24h si le PC était hors-ligne, ou ~30 secondes au prochain démarrage si connecté.</p>,
          <p key="p3">Il faut donc <strong>toujours communiquer la nouvelle clé à l&apos;école</strong> après un renouvellement -- rien ne se met à jour tout seul côté école.</p>,
        ],
      },
      {
        id: 'suspension',
        title: 'Suspendre une école (kill switch)',
        body: [
          <p key="p1">Bouton &quot;Suspendre&quot; sur la fiche école. Prend effet sur l&apos;app locale via la même vérification quotidienne en arrière-plan que le renouvellement -- pas instantané, mais dans la journée si l&apos;école est en ligne.</p>,
          <p key="p2">Une école suspendue est <strong>totalement bloquée</strong> (écran plein, pas juste lecture seule) -- différent du cas &quot;licence expirée&quot; qui laisse consulter/imprimer.</p>,
        ],
      },
      {
        id: 'domaine',
        title: 'Domaine CAP',
        body: [
          <p key="p1">L&apos;app locale contacte <code className="bg-steel-100 px-1 rounded text-xs">cap.scoladesk.com</code> (configuré via <code className="bg-steel-100 px-1 rounded text-xs">CAP_API_URL</code> dans le <code className="bg-steel-100 px-1 rounded text-xs">.env</code> embarqué dans chaque build). Ce sous-domaine est volontairement séparé de <code className="bg-steel-100 px-1 rounded text-xs">www.scoladesk.com</code> pour que le site public futur puisse changer librement sans jamais casser les installations déjà actives.</p>,
        ],
      },
    ],
  },
  {
    id: 'reseau',
    title: 'Réseau multi-poste',
    items: [
      {
        id: 'acces-lan',
        title: "Accès depuis un autre PC de l'école",
        body: [
          <p key="p1">Le PC principal (celui qui a l&apos;app installée) sert aussi les autres postes du réseau local via un simple navigateur : <code className="bg-steel-100 px-1 rounded text-xs">http://scoladesk:3000</code> (si le PC a été renommé &quot;scoladesk&quot; à l&apos;installation) ou <code className="bg-steel-100 px-1 rounded text-xs">http://&lt;ip-du-pc&gt;:3000</code>.</p>,
        ],
      },
      {
        id: 'pare-feu',
        title: "Pare-feu Windows -- ça ne marche pas depuis un autre poste",
        body: [
          <p key="p1"><strong>Symptôme :</strong> le PC principal fonctionne, mais les autres postes n&apos;arrivent pas à charger la page.</p>,
          <p key="p2"><strong>Cause :</strong> le pare-feu Windows du PC principal bloque le port 3000 pour les connexions entrantes venant du réseau.</p>,
          <p key="p3"><strong>Correction</strong> — sur le PC principal, ouvrir PowerShell en administrateur et exécuter :</p>,
          <pre key="pre1" className="bg-steel-800 text-steel-100 rounded-lg p-3 text-xs overflow-x-auto">
{`netsh advfirewall firewall add rule name="ScolaDesk" dir=in action=allow protocol=TCP localport=3000`}
          </pre>,
          <p key="p4">Ou via l&apos;interface graphique : Panneau de configuration → Pare-feu Windows Defender → Paramètres avancés → Règles de trafic entrant → Nouvelle règle → Port → TCP 3000 → Autoriser.</p>,
        ],
      },
    ],
  },
  {
    id: 'usb',
    title: 'Sauvegarde USB',
    items: [
      {
        id: 'fichier-marqueur',
        title: 'La clé USB ne se fait pas détecter',
        body: [
          <p key="p1"><strong>Symptôme :</strong> le panneau de sauvegarde en haut de l&apos;app ne détecte jamais la clé USB branchée.</p>,
          <p key="p2"><strong>Cause :</strong> l&apos;app ne sauvegarde que sur une clé contenant un fichier marqueur vide nommé exactement <code className="bg-steel-100 px-1 rounded text-xs">.scoladesk_backup</code> à sa racine -- ce n&apos;est pas automatique, c&apos;est une étape de configuration à faire une fois par clé.</p>,
          <p key="p3"><strong>Correction :</strong> sur la clé USB, créer un fichier vide nommé exactement <code className="bg-steel-100 px-1 rounded text-xs">.scoladesk_backup</code> (pas d&apos;extension) à la racine (pas dans un sous-dossier).</p>,
          <p key="p4">Fonctionnement une fois configuré : sauvegarde automatique une fois par jour (à partir de 17h, ou dès que la clé est branchée après cette heure), garde les 7 sauvegardes les plus récentes, vérifie l&apos;intégrité de chaque copie.</p>,
        ],
      },
    ],
  },
  {
    id: 'sync-restore',
    title: 'Synchronisation & Restauration',
    items: [
      {
        id: 'quoi-restaure',
        title: "Ce qui revient (et ce qui NE revient PAS) après une restauration",
        body: [
          <p key="p1">La restauration récupère tout ce qui était dans la <strong>dernière synchronisation réussie</strong> -- rien ajouté après cette sync ne revient (normal, pas un bug).</p>,
          <p key="p2"><strong>Ne revient jamais</strong> (exclu par conception) : comptes utilisateurs (l&apos;admin doit en recréer via l&apos;écran de création après restauration), le fichier logo de l&apos;école (seul le chemin revient, l&apos;école doit re-uploader l&apos;image), journal d&apos;audit, journal de synchronisation.</p>,
        ],
      },
      {
        id: 'pc-different',
        title: 'Restaurer sur un PC différent (perte totale, vol, casse)',
        body: [
          <p key="p1">1. Installer l&apos;app sur le nouveau PC. 2. Activer avec la même clé de licence — CAP refusera si l&apos;ancien PC est encore lié (voir &quot;Débloquer un matériel&quot; sur la fiche école, ou &quot;Nouvelle clé&quot; si la clé est perdue). 3. L&apos;app détecte une base vide après activation et propose automatiquement la restauration depuis le cloud.</p>,
        ],
      },
    ],
  },
  {
    id: 'depannage',
    title: 'Dépannage',
    items: [
      {
        id: 'ecran-blanc',
        title: "Écran blanc au lancement de l'app",
        body: [
          <p key="p1"><strong>Cause la plus fréquente :</strong> le serveur interne n&apos;a pas réussi à démarrer (souvent un port déjà utilisé par une autre instance de l&apos;app encore ouverte en arrière-plan).</p>,
          <p key="p2"><strong>Correction :</strong> fermer complètement l&apos;app (vérifier dans le Gestionnaire des tâches qu&apos;aucun processus &quot;ScolaDesk&quot; ne tourne encore), relancer. Si ça persiste, ouvrir <code className="bg-steel-100 px-1 rounded text-xs">%APPDATA%\scola_desk_v1.0\logs\main.log</code> et chercher la dernière ligne d&apos;erreur (<code className="bg-steel-100 px-1 rounded text-xs">[ERR]</code>).</p>,
        ],
      },
      {
        id: 'erreur-serveur-activation',
        title: "\"Erreur serveur\" lors de l'activation",
        body: [
          <p key="p1"><strong>Cause :</strong> soit CAP est injoignable (pas d&apos;internet, ou cap.scoladesk.com hors ligne), soit une migration Supabase récente n&apos;a pas été appliquée en base (une colonne attendue par le code n&apos;existe pas encore côté Supabase).</p>,
          <p key="p2"><strong>Correction :</strong> vérifier que cap.scoladesk.com répond dans un navigateur. Si oui, vérifier les migrations Supabase les plus récentes dans <code className="bg-steel-100 px-1 rounded text-xs">scola_desk_CAP/supabase/migrations/</code> ont bien été collées dans l&apos;éditeur SQL de Supabase.</p>,
        ],
      },
      {
        id: 'icone-app',
        title: "L'icône de l'app affiche le mauvais logo dans l'explorateur",
        body: [
          <p key="p1"><strong>Cause :</strong> le cache d&apos;icônes de Windows, pas un vrai problème -- le fichier lui-même a la bonne icône.</p>,
          <p key="p2"><strong>Correction :</strong> redémarrer le PC, ou déplacer/copier le fichier .exe ailleurs pour forcer Windows à relire l&apos;icône.</p>,
        ],
      },
      {
        id: 'modale-bloquee',
        title: "Une fenêtre de confirmation reste bloquée en 'chargement' sans pouvoir cliquer Annuler",
        body: [
          <p key="p1"><strong>Cause :</strong> corrigé le 2026-07-18 (l&apos;action a échoué -- souvent une licence bloquée -- et le bouton restait désactivé indéfiniment). Si ça arrive encore sur une version récente, c&apos;est un nouveau bug à signaler, pas un cas connu.</p>,
          <p key="p2"><strong>Solution immédiate en attendant :</strong> fermer complètement l&apos;app et la relancer.</p>,
        ],
      },
      {
        id: 'promotion-verrouillee',
        title: '"La promotion ne peut être exécutée qu\'après le [date]"',
        body: [
          <p key="p1"><strong>Cause :</strong> normal, pas un bug -- la promotion de fin d&apos;année est verrouillée jusqu&apos;à ce que la date de fin de l&apos;année scolaire en cours (toujours le 31 juillet) soit passée. Aucune façon de forcer l&apos;exécution avant.</p>,
        ],
      },
      {
        id: 'desinstallation-introuvable',
        title: "Impossible de trouver l'app dans \"Applications installées\"",
        body: [
          <p key="p1"><strong>Cause :</strong> l&apos;app s&apos;installe par utilisateur (pas besoin de droits admin), donc elle n&apos;apparaît pas toujours dans l&apos;ancien Panneau de configuration → Programmes. Elle est bien enregistrée.</p>,
          <p key="p2"><strong>Correction :</strong> utiliser l&apos;app Paramètres moderne de Windows (pas le Panneau de configuration) : <kbd className="px-1.5 py-0.5 bg-steel-100 rounded text-xs font-mono">Win</kbd> puis taper &quot;Applications installées&quot;, chercher &quot;ScolaDesk&quot;.</p>,
        ],
      },
    ],
  },
  {
    id: 'build',
    title: 'Build & Publication (interne dev)',
    items: [
      {
        id: 'rebuild',
        title: 'Reconstruire un nouvel installeur',
        body: [
          <pre key="pre1" className="bg-steel-800 text-steel-100 rounded-lg p-3 text-xs overflow-x-auto">
{`npm run build
node scripts/obfuscate.js
npx electron-builder`}
          </pre>,
          <p key="p1">Résultat : <code className="bg-steel-100 px-1 rounded text-xs">release\ScolaDesk Setup X.X.X.exe</code> -- c&apos;est le seul fichier à distribuer aux écoles.</p>,
        ],
      },
      {
        id: 'package-json-corrompu',
        title: 'package.json perd ses scripts après un build',
        body: [
          <p key="p1"><strong>Cause :</strong> electron-builder trimme temporairement package.json pendant le packaging et le restaure normalement après -- mais si l&apos;étape NSIS échoue (voir ci-dessous), il ne restaure pas toujours.</p>,
          <p key="p2"><strong>Correction :</strong> <code className="bg-steel-100 px-1 rounded text-xs">git checkout package.json</code> après chaque build, systématiquement.</p>,
        ],
      },
      {
        id: 'wincodesign',
        title: 'Erreur winCodeSign / build NSIS échoue',
        body: [
          <p key="p1"><strong>Cause :</strong> electron-builder télécharge un outil de signature macOS même pour un build Windows, et son extraction nécessite un droit Windows (&quot;Créer des liens symboliques&quot;) pas toujours disponible.</p>,
          <p key="p2"><strong>Correction :</strong> extraire manuellement l&apos;archive avec 7-Zip du projet dans <code className="bg-steel-100 px-1 rounded text-xs">%LOCALAPPDATA%\electron-builder\Cache\winCodeSign\winCodeSign-2.6.0</code> (2 erreurs de lien symbolique sur des fichiers macOS sont normales et sans impact), ou activer le Mode développeur Windows pour que l&apos;extraction automatique fonctionne.</p>,
        ],
      },
    ],
  },
]

export default function DocsPage() {
  const [activeItem, setActiveItem] = useState(`${SECTIONS[0].id}:${SECTIONS[0].items[0].id}`)
  const [search, setSearch] = useState('')

  const q = search.trim().toLowerCase()
  const filteredSections = q
    ? SECTIONS.map(s => ({
        ...s,
        items: s.items.filter(i => i.title.toLowerCase().includes(q) || s.title.toLowerCase().includes(q)),
      })).filter(s => s.items.length > 0)
    : SECTIONS

  const [activeSectionId, activeItemId] = activeItem.split(':')
  const activeSection = SECTIONS.find(s => s.id === activeSectionId)
  const active = activeSection?.items.find(i => i.id === activeItemId)

  return (
    <PageShell>
      <div className="flex gap-6 items-start">
        {/* Quick-nav — sticky, section by section, click to jump straight
            to any entry without scrolling through everything else. */}
        <nav className="w-64 shrink-0 sticky top-8 max-h-[calc(100vh-4rem)] overflow-y-auto">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher..."
            className="w-full px-3 py-1.5 mb-3 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand"
          />
          <div className="space-y-4">
            {filteredSections.map(section => (
              <div key={section.id}>
                <p className="text-xs font-semibold text-steel-400 uppercase tracking-wide px-2 mb-1">{section.title}</p>
                <div className="space-y-0.5">
                  {section.items.map(item => {
                    const key = `${section.id}:${item.id}`
                    return (
                      <button
                        key={key}
                        onClick={() => setActiveItem(key)}
                        className={`block w-full text-left px-2 py-1.5 rounded-lg text-sm transition-colors ${
                          activeItem === key ? 'bg-brand-50 text-brand-600 font-medium' : 'text-steel-600 hover:bg-steel-100'
                        }`}
                      >
                        {item.title}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </nav>

        {/* Content */}
        <div className="flex-1 bg-white rounded-xl border border-steel-200 p-8 min-h-[60vh]">
          {active ? (
            <>
              <p className="text-xs text-steel-400 uppercase tracking-wide mb-1">{activeSection.title}</p>
              <h1 className="text-lg font-medium text-steel-900 mb-4">{active.title}</h1>
              <div className="space-y-3 text-sm text-steel-700 leading-relaxed max-w-2xl">
                {active.body}
              </div>
            </>
          ) : (
            <p className="text-sm text-steel-400">Aucun résultat pour cette recherche.</p>
          )}
        </div>
      </div>
    </PageShell>
  )
}
