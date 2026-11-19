// Contrat partagé entre l'interface et la fonction Supabase carnet-api.

/**
 * Rôles du carnet, ouverts compte par compte (filtrage sur le serveur) :
 * - participant : saisit ses propres patientes (le compte doit être rattaché à un identifiant AFYA) ;
 * - formateur : voit toutes les patientes de tous les participants, en lecture seule.
 * Un compte formateur l'emporte : il ne saisit rien.
 */
export const SECTIONS = ['participant', 'formateur'] as const;
export type Section = (typeof SECTIONS)[number];

export const SECTION_LABELS: Record<Section, string> = {
  participant: 'Participant',
  formateur: 'Formateur',
};

// ── Carnet ──────────────────────────────────────────────────────────────────

/** Participant AFYA, par exemple « AFYA / ETH / 2024 / 01 ». */
export interface Participant {
  id: string;
  name: string;
  country: string;
  site: string;
  /** Nom de famille : sert au numéro des patientes (ETH_GIRMA_001). */
  last: string;
  first?: string;
  specialty?: string | null;
  /** Certification de l'atelier, saisie par l'équipe pédagogique. */
  ws: { date: string; place: string } | null;
  registered?: boolean;
}

export const TIMEPOINTS = ['pre', 'd30', 'm6', 'm12', 'late'] as const;
export type Timepoint = (typeof TIMEPOINTS)[number];

export interface Complication {
  type: string;
  date: string;
  grade: string;
}

export interface Visit {
  status: 'seen' | 'lost';
  /** Suivi tardif : date de la visite. */
  date?: string;
  wexner?: (number | null)[];
  fiq8?: Record<string, number | 'na'>;
  sex?: { active: boolean | null; reason: string | null; dysp: string | null; fear: boolean | null };
  continence?: string | null;
}

export interface Operation {
  spType: string | null;
  assoc: string[];
  quality: string | null;
  contam: string | null;
  suture: { mat: string | null; size: string | null };
  abx: string | null;
  abxList: string[];
  note: string;
}

export interface Feedback {
  from: 'trainer' | 'part';
  kind: 'msg' | 'val' | 'kudos';
  text: string;
  date: string;
  read: boolean;
}

export interface Patient {
  code: string;
  pid: string;
  age: number;
  parity: number;
  hospital: string;
  consultDate: string | null;
  date: string;
  type: 'SP' | 'RVF' | 'BOTH';
  origin: string;
  causeNote: string;
  durMonths: number | null;
  prior: string | null;
  priorOk: string | null;
  uro: string | null;
  uroNote: string;
  cloaca: string | null;
  pbody: string | null;
  rvfEx: string | null;
  exam: string;
  plan: string;
  op: Operation | null;
  diffs: string[];
  diffNote: string;
  comps: Complication[];
  flag: boolean;
  visits: Partial<Record<Timepoint, Visit>>;
  fb: Feedback[];
}

export interface Workshop {
  id: string;
  place: string;
  date: string;
  active: boolean;
}

/** Comparaison avec le groupe et réseau AFYA : calculés sur le serveur, jamais de fiche d'un autre. */
export interface GroupView {
  /** null tant que le groupe compte moins de 5 participants avec des patientes. */
  cmp: { wxPre: number | null; wxLast: number | null; f8Pre: number | null; f8M12: number | null; m12Pct: number | null; compPct: number } | null;
  network: {
    total: number;
    countries: Record<string, number>;
    cotm: { type: string; country: string; wxPre: number | null; wxLast: number | null; f8Pre: number | null; f8Last: number | null; spType: string | null; name: string } | null;
  };
}

export interface CarnetView {
  role: 'part' | 'trainer';
  participant: Participant | null;
  participants: Participant[];
  patients: Patient[];
  workshops: Workshop[];
  group: GroupView | null;
}

export interface MeView {
  email: string;
  displayName: string;
  sections: Section[];
  /** Application d'authentification activée sur ce compte. */
  totpEnabled: boolean;
  /** Mot de passe provisoire : à changer avant d'accéder aux données. */
  mustChangePassword: boolean;
  /** Peut gérer les comptes des autres personnes. */
  isAdmin: boolean;
}

/** Un compte vu par un administrateur. Jamais de mot de passe ni de secret. */
export interface AdminUser {
  id: string;
  email: string;
  displayName: string;
  sections: Section[];
  disabled: boolean;
  totpEnabled: boolean;
  mustChangePassword: boolean;
  isAdmin: boolean;
  lastLoginAt: string | null;
}

/** Création ou réinitialisation : le mot de passe provisoire n'est renvoyé que cette fois-là. */
export interface AdminPasswordResult {
  user: AdminUser;
  temporaryPassword: string;
}

/** Après le mot de passe : soit la session est ouverte, soit il faut encore le code de l'application. */
/** Ce que la page de connexion peut proposer avant toute session. */
export interface AuthOptions {
  /** « Mot de passe oublié » par e-mail disponible (un envoi d'e-mails est configuré sur le serveur). */
  resetByEmail: boolean;
}

export type LoginStep = { step: 'done'; me: MeView } | { step: 'code' };

export interface TotpSetup {
  /** Secret en base32, pour une saisie à la main dans l'application. */
  secret: string;
  /** Lien otpauth:// à afficher en QR code. */
  uri: string;
}

/** Ce que reçoit la page d'accueil : les rubriques ouvertes au compte. */
export interface AccueilView {
  sections: Section[];
  horodatage: string;
}
