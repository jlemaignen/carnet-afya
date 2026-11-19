import type { CarnetView, Feedback, Patient } from '../lib/contract.ts';

export interface RegistrationInput {
  first: string;
  last: string;
  email: string;
  phone: string;
  country: string;
  hospital: string;
  specialty: string;
  workshop: string;
  consent: true;
}

export function startCarnet(
  root: HTMLElement,
  opts: {
    view: CarnetView;
    isAdmin: boolean;
    notice?: string;
    /** "register" : écran d'inscription seul, sans session (lien ou QR code d'atelier). */
    mode?: 'carnet' | 'register';
    invite?: string | null;
    save: (p: { code: string }) => Promise<Patient>;
    feedback: (code: string, kind: string, text: string) => Promise<{ fb: Feedback[] }>;
    readFeedback: (code: string) => Promise<{ fb: Feedback[] }>;
    register: (r: RegistrationInput) => Promise<unknown>;
    onLogout: () => void;
    onSecurity: () => void;
    onAdmin: () => void;
    onTeam: () => void;
    onLogin: () => void;
  },
): () => void;
