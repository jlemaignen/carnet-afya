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
}

export const TIMEPOINTS = ['pre', 'd30', 'm6', 'm12'] as const;
export type Timepoint = (typeof TIMEPOINTS)[number];

export interface Complication {
  type: string;
  date: string;
  grade: string;
}

/** Une évaluation (préopératoire ou suivi). « lost » : perdue de vue, sans autre donnée. */
export interface Visit {
  status: 'seen' | 'lost';
  wexner?: (number | null)[];
  fiql?: Record<string, number | null>;
  sex?: { active: boolean | null; reason: string | null; dysp: boolean | null; fear: boolean | null };
  continence?: string | null;
}

/** Une patiente, connue seulement par son code : aucune identité n'est saisie. */
export interface Patient {
  code: string;
  pid: string;
  age: number;
  parity: number;
  hospital: string;
  date: string;
  type: 'SP' | 'RVF' | 'BOTH';
  origin: string;
  diffs: string[];
  diffNote: string;
  comps: Complication[];
  flag: boolean;
  visits: Partial<Record<Timepoint, Visit>>;
}

/** Tout ce que le carnet charge à l'ouverture, déjà filtré selon le rôle. */
export interface CarnetView {
  role: 'part' | 'trainer';
  /** Le participant rattaché au compte (rôle participant). */
  participant: Participant | null;
  participants: Participant[];
  patients: Patient[];
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
