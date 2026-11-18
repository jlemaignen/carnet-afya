import nodemailer from 'nodemailer';
import type { Config } from './config.ts';

/** Envoi des e-mails de l'app (aujourd'hui : le lien de réinitialisation du mot de passe). */
export interface Mailer {
  send(message: { to: string; subject: string; text: string; html: string }): Promise<void>;
}

/**
 * - smtp : envoi réel (Microsoft 365 ou autre serveur SMTP), réglé par les variables SMTP_* ;
 * - log : le message est écrit dans le journal du serveur, pour le développement local ;
 * - none : pas d'envoi, « Mot de passe oublié » n'est pas proposé (seul un administrateur réinitialise).
 */
export function createMailer(config: Config['mail'], log: (msg: string) => void = console.log): Mailer | null {
  if (config.transport === 'none') return null;
  if (config.transport === 'log') {
    return {
      async send(m) {
        log(`[e-mail non envoyé, mode log] à ${m.to} : ${m.subject}\n${m.text}`);
      },
    };
  }
  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure, // true : TLS dès la connexion (465) ; false : STARTTLS (587)
    requireTLS: !config.secure,
    auth: config.user ? { user: config.user, pass: config.password } : undefined,
  });
  return {
    async send(m) {
      await transport.sendMail({ from: config.from, to: m.to, subject: m.subject, text: m.text, html: m.html });
    },
  };
}
