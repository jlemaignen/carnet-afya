import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { SECTIONS, type Participant, type Patient, type Section } from './contract.ts';

export interface UserRow {
  id: number;
  email: string;
  display_name: string;
  password_hash: string;
  /** Rubriques autorisées, JSON. */
  sections: string;
  disabled: number;
  /** Toute session émise avant cette date (ms) est refusée : changement de mot de passe, de rubriques, désactivation. */
  sessions_valid_after: number;
  last_login_at: string | null;
  /** Secret de l'application d'authentification, chiffré ; null = second facteur non activé. */
  totp_secret: string | null;
  /** Secret proposé pendant l'activation, tant que le premier code n'a pas été validé. */
  totp_pending: string | null;
  /** Dernière période de 30 s dont le code a servi (anti-rejeu). */
  totp_last_step: number;
  /** 1 = mot de passe provisoire (création ou réinitialisation) : à changer avant d'accéder aux données. */
  must_change_password: number;
  /** 1 = peut gérer les comptes des autres (jamais ceux des administrateurs). Attribué sur le serveur uniquement. */
  is_admin: number;
}

export interface ChallengeRow {
  id: string;
  user_id: number;
  expires_at: number;
  attempts: number;
}

export interface ResetRow {
  token_hash: string;
  user_id: number;
  expires_at: number;
  attempts: number;
}

export function userSections(u: Pick<UserRow, 'sections'>): Section[] {
  try {
    const list = JSON.parse(u.sections) as unknown;
    return Array.isArray(list) ? SECTIONS.filter((s) => list.includes(s)) : [];
  } catch {
    return [];
  }
}

/**
 * SQLite local : comptes nominatifs (mot de passe haché argon2id, rubriques autorisées, secret
 * chiffré de l'application d'authentification), connexions en attente du code et journal des connexions et consultations. Aucun chiffre du
 * tableau de bord n'est stocké ici.
 */
export class Repository {
  private readonly db: DatabaseSync;

  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL UNIQUE COLLATE NOCASE,
        display_name TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        sections TEXT NOT NULL DEFAULT '[]',
        disabled INTEGER NOT NULL DEFAULT 0,
        sessions_valid_after INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        last_login_at TEXT,
        totp_secret TEXT,
        totp_pending TEXT,
        totp_last_step INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS challenges (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at INTEGER NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS password_resets (
        token_hash TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at INTEGER NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        at TEXT NOT NULL DEFAULT (datetime('now')),
        user_id INTEGER,
        kind TEXT NOT NULL,
        detail TEXT
      );
    `);
    // Carnet : participants AFYA (rattachés à un compte) et patientes, une fiche JSON par patiente.
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS participants (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        country TEXT NOT NULL,
        site TEXT NOT NULL,
        user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE SET NULL
      );
      CREATE TABLE IF NOT EXISTS patients (
        code TEXT PRIMARY KEY,
        participant_id TEXT NOT NULL REFERENCES participants(id),
        data TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_by INTEGER
      );
      CREATE INDEX IF NOT EXISTS patients_participant ON patients(participant_id);
    `);
    // Migration : colonne ajoutée après la mise en service, sans effacer les comptes existants
    const colonnes = this.db.prepare('PRAGMA table_info(users)').all() as { name: string }[];
    if (!colonnes.some((c) => c.name === 'must_change_password')) {
      this.db.exec('ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0');
    }
    if (!colonnes.some((c) => c.name === 'is_admin')) {
      this.db.exec('ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0');
    }
  }

  // ── Comptes ──────────────────────────────────────────────────────────────

  findUserByEmail(email: string): UserRow | undefined {
    return this.db.prepare('SELECT * FROM users WHERE email = ?').get(email) as UserRow | undefined;
  }

  findUser(id: number): UserRow | undefined {
    return this.db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
  }

  listUsers(): Omit<UserRow, 'password_hash'>[] {
    return this.db
      .prepare('SELECT id, email, display_name, sections, disabled, sessions_valid_after, last_login_at, totp_secret, totp_pending, totp_last_step, must_change_password, is_admin FROM users ORDER BY email')
      .all() as unknown as Omit<UserRow, 'password_hash'>[];
  }

  /** mustChange : mot de passe provisoire, la personne le remplace à sa première connexion. */
  createUser(email: string, displayName: string, passwordHash: string, sections: Section[], mustChange = false): number {
    const r = this.db
      .prepare('INSERT INTO users (email, display_name, password_hash, sections, must_change_password) VALUES (?, ?, ?, ?, ?)')
      .run(email, displayName, passwordHash, JSON.stringify(sections), mustChange ? 1 : 0);
    return Number(r.lastInsertRowid);
  }

  /** Nouveau mot de passe : les sessions ouvertes sont coupées. mustChange : provisoire (réinitialisation). */
  setPassword(id: number, passwordHash: string, nowMs = Date.now(), mustChange = false): void {
    this.db
      .prepare('UPDATE users SET password_hash = ?, sessions_valid_after = ?, must_change_password = ? WHERE id = ?')
      .run(passwordHash, nowMs, mustChange ? 1 : 0, id);
  }

  setAdmin(id: number, admin: boolean): void {
    this.db.prepare('UPDATE users SET is_admin = ? WHERE id = ?').run(admin ? 1 : 0, id);
  }

  setDisplayName(id: number, displayName: string): void {
    this.db.prepare('UPDATE users SET display_name = ? WHERE id = ?').run(displayName, id);
  }

  setSections(id: number, sections: Section[]): void {
    this.db.prepare('UPDATE users SET sections = ? WHERE id = ?').run(JSON.stringify(sections), id);
  }

  setDisabled(id: number, disabled: boolean, nowMs = Date.now()): void {
    this.db.prepare('UPDATE users SET disabled = ?, sessions_valid_after = ? WHERE id = ?').run(disabled ? 1 : 0, nowMs, id);
    this.db.prepare('DELETE FROM challenges WHERE user_id = ?').run(id);
    this.db.prepare('DELETE FROM password_resets WHERE user_id = ?').run(id);
  }

  /** Supprime un compte ; le journal garde l'identifiant numérique. */
  deleteUser(id: number): void {
    this.db.prepare('DELETE FROM users WHERE id = ?').run(id);
  }

  touchLogin(id: number): void {
    this.db.prepare("UPDATE users SET last_login_at = datetime('now') WHERE id = ?").run(id);
  }

  // ── Application d'authentification ───────────────────────────────────────

  setTotpPending(id: number, sealed: string | null): void {
    this.db.prepare('UPDATE users SET totp_pending = ? WHERE id = ?').run(sealed, id);
  }

  enableTotp(id: number, sealed: string, step: number): void {
    this.db.prepare('UPDATE users SET totp_secret = ?, totp_pending = NULL, totp_last_step = ? WHERE id = ?').run(sealed, step, id);
  }

  setTotpStep(id: number, step: number): void {
    this.db.prepare('UPDATE users SET totp_last_step = ? WHERE id = ?').run(step, id);
  }

  /** Retire le second facteur (téléphone perdu, ou à la demande de la personne). */
  clearTotp(id: number): void {
    this.db.prepare('UPDATE users SET totp_secret = NULL, totp_pending = NULL, totp_last_step = 0 WHERE id = ?').run(id);
    this.db.prepare('DELETE FROM challenges WHERE user_id = ?').run(id);
  }

  // ── Connexions en attente du code ────────────────────────────────────────

  createChallenge(id: string, userId: number, expiresAtMs: number): void {
    this.db.prepare('DELETE FROM challenges WHERE user_id = ?').run(userId);
    this.db.prepare('INSERT INTO challenges (id, user_id, expires_at) VALUES (?, ?, ?)').run(id, userId, expiresAtMs);
  }

  findChallenge(id: string): ChallengeRow | undefined {
    return this.db.prepare('SELECT * FROM challenges WHERE id = ?').get(id) as ChallengeRow | undefined;
  }

  bumpChallenge(id: string): void {
    this.db.prepare('UPDATE challenges SET attempts = attempts + 1 WHERE id = ?').run(id);
  }

  deleteChallenge(id: string): void {
    this.db.prepare('DELETE FROM challenges WHERE id = ?').run(id);
  }

  purgeChallenges(nowMs = Date.now()): void {
    this.db.prepare('DELETE FROM challenges WHERE expires_at < ?').run(nowMs);
  }

  // ── Liens « Mot de passe oublié » ────────────────────────────────────────

  /** Un seul lien valable à la fois par compte : une nouvelle demande annule la précédente. */
  createReset(tokenHash: string, userId: number, expiresAtMs: number): void {
    this.db.prepare('DELETE FROM password_resets WHERE user_id = ?').run(userId);
    this.db.prepare('INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(tokenHash, userId, expiresAtMs);
  }

  findReset(tokenHash: string): ResetRow | undefined {
    return this.db.prepare('SELECT * FROM password_resets WHERE token_hash = ?').get(tokenHash) as ResetRow | undefined;
  }

  bumpReset(tokenHash: string): void {
    this.db.prepare('UPDATE password_resets SET attempts = attempts + 1 WHERE token_hash = ?').run(tokenHash);
  }

  deleteResets(userId: number): void {
    this.db.prepare('DELETE FROM password_resets WHERE user_id = ?').run(userId);
  }

  purgeResets(nowMs = Date.now()): void {
    this.db.prepare('DELETE FROM password_resets WHERE expires_at < ?').run(nowMs);
  }

  /** Demandes de réinitialisation faites pour ce compte depuis cette date (limite d'envoi). */
  countResetRequests(userId: number, sinceIso: string): number {
    const r = this.db.prepare("SELECT COUNT(*) AS n FROM events WHERE user_id = ? AND kind = 'password_reset_requested' AND at >= ?").get(userId, sinceIso) as { n: number };
    return Number(r.n);
  }

  // ── Carnet ───────────────────────────────────────────────────────────────

  upsertParticipant(p: Participant): void {
    this.db
      .prepare('INSERT INTO participants (id, name, country, site) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name, country = excluded.country, site = excluded.site')
      .run(p.id, p.name, p.country, p.site);
  }

  /** Rattache un participant à un compte (un compte = un participant au plus). null : détache. */
  linkParticipant(participantId: string, userId: number | null): void {
    if (userId !== null) this.db.prepare('UPDATE participants SET user_id = NULL WHERE user_id = ?').run(userId);
    this.db.prepare('UPDATE participants SET user_id = ? WHERE id = ?').run(userId, participantId);
  }

  listParticipants(): (Participant & { userId: number | null })[] {
    return (this.db.prepare('SELECT id, name, country, site, user_id FROM participants ORDER BY id').all() as unknown as (Participant & { user_id: number | null })[])
      .map(({ user_id, ...p }) => ({ ...p, userId: user_id }));
  }

  participantOfUser(userId: number): Participant | undefined {
    return this.db.prepare('SELECT id, name, country, site FROM participants WHERE user_id = ?').get(userId) as Participant | undefined;
  }

  findPatientOwner(code: string): string | undefined {
    const r = this.db.prepare('SELECT participant_id FROM patients WHERE code = ?').get(code) as { participant_id: string } | undefined;
    return r?.participant_id;
  }

  /** Toutes les patientes (participantId absent) ou celles d'un participant, les plus récentes d'abord. */
  listPatients(participantId?: string): Patient[] {
    const rows = (participantId
      ? this.db.prepare('SELECT data FROM patients WHERE participant_id = ?').all(participantId)
      : this.db.prepare('SELECT data FROM patients').all()) as { data: string }[];
    return rows.map((r) => JSON.parse(r.data) as Patient).sort((a, b) => b.date.localeCompare(a.date) || b.code.localeCompare(a.code));
  }

  savePatient(p: Patient, userId: number): void {
    this.db
      .prepare(
        "INSERT INTO patients (code, participant_id, data, updated_by) VALUES (?, ?, ?, ?) ON CONFLICT(code) DO UPDATE SET data = excluded.data, updated_at = datetime('now'), updated_by = excluded.updated_by",
      )
      .run(p.code, p.pid, JSON.stringify(p), userId);
  }

  // ── Journal ──────────────────────────────────────────────────────────────

  log(kind: string, userId: number | null, detail?: string): void {
    this.db.prepare('INSERT INTO events (user_id, kind, detail) VALUES (?, ?, ?)').run(userId, kind, detail ?? null);
  }

  recentEvents(limit = 50): { at: string; email: string | null; kind: string; detail: string | null }[] {
    return this.db
      .prepare(
        'SELECT e.at, u.email, e.kind, e.detail FROM events e LEFT JOIN users u ON u.id = e.user_id ORDER BY e.id DESC LIMIT ?',
      )
      .all(limit) as unknown as { at: string; email: string | null; kind: string; detail: string | null }[];
  }
}
