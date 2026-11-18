// Contrat entre le serveur et le front. Aucune donnée patient ne transite par cette app.

/**
 * Rubriques ouvertes compte par compte (filtrage sur le serveur). Liste provisoire : le contenu du
 * tableau de bord du Carnet AFYA reste à définir, une rubrique s'ajoute ici puis dans
 * SECTION_LABELS.
 */
export const SECTIONS = ['general'] as const;
export type Section = (typeof SECTIONS)[number];

export const SECTION_LABELS: Record<Section, string> = {
  general: 'Carnet AFYA',
};

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
  id: number;
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
