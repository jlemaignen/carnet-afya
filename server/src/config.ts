function env(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === '') {
    throw new Error(`Variable d'environnement manquante : ${name}`);
  }
  return value;
}

export type MailTransport = 'smtp' | 'log' | 'none';

export interface Config {
  port: number;
  publicBaseUrl: string;
  sessionSecret: string;
  dbPath: string;
  sessionMaxAgeSeconds: number;
  /** Temps laissé pour saisir le code de l'application d'authentification après le mot de passe. */
  codeTtlSeconds: number;
  /** Durée de validité du lien « Mot de passe oublié ». */
  resetTtlSeconds: number;
  mail: {
    transport: MailTransport;
    host: string;
    port: number;
    secure: boolean;
    user: string;
    password: string;
    from: string;
  };
}

function loadMail(): Config['mail'] {
  const transport = env('MAIL_TRANSPORT', 'none') as MailTransport;
  if (!['smtp', 'log', 'none'].includes(transport)) throw new Error('MAIL_TRANSPORT : smtp, log ou none');
  const smtp = transport === 'smtp';
  return {
    transport,
    host: smtp ? env('SMTP_HOST') : '',
    port: Number(env('SMTP_PORT', '587')),
    secure: env('SMTP_SECURE', 'false') === 'true',
    user: smtp ? env('SMTP_USER', '') : '',
    password: smtp ? env('SMTP_PASSWORD', '') : '',
    from: smtp ? env('MAIL_FROM') : 'carnet-afya@localhost',
  };
}

export function loadConfig(): Config {
  const sessionSecret = env('SESSION_SECRET');
  if (sessionSecret.length < 32) throw new Error('SESSION_SECRET doit faire au moins 32 caractères');
  const publicBaseUrl = env('PUBLIC_BASE_URL', 'http://localhost:3030').replace(/\/$/, '');

  return {
    port: Number(env('PORT', '3030')),
    publicBaseUrl,
    sessionSecret,
    dbPath: env('DB_PATH', './data/carnet-afya.db'),
    sessionMaxAgeSeconds: 8 * 3600,
    codeTtlSeconds: 5 * 60,
    resetTtlSeconds: 30 * 60,
    mail: loadMail(),
  };
}
