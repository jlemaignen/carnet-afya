import { existsSync } from 'node:fs';
import { join } from 'node:path';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance } from 'fastify';
import { LoginThrottle } from './auth.ts';
import type { Config } from './config.ts';
import type { Repository } from './db.ts';
import type { Mailer } from './mailer.ts';
import { registerAccueilRoutes } from './routes/accueil.ts';
import { registerAdminRoutes } from './routes/admin.ts';
import { registerAuthRoutes } from './routes/auth.ts';

export interface AppDeps {
  config: Config;
  repo: Repository;
  webDist?: string;
  logger?: boolean;
  throttle?: LoginThrottle;
  /** null ou absent : pas d'envoi d'e-mails, « Mot de passe oublié » n'est pas proposé. */
  mailer?: Mailer | null;
}

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({
    trustProxy: true, // derrière Caddy : IP réelle pour la limite de débit
    bodyLimit: 16 * 1024,
    logger: deps.logger === false ? false : {
      serializers: {
        req: (req) => ({ method: req.method, url: req.url }),
      },
    },
  });

  const secure = deps.config.publicBaseUrl.startsWith('https://');
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        styleSrcAttr: ["'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        frameAncestors: ["'none'"],
        formAction: ["'self'"],
        upgradeInsecureRequests: secure ? [] : null,
      },
    },
    referrerPolicy: { policy: 'no-referrer' },
    hsts: secure ? { maxAge: 31536000, includeSubDomains: true } : false,
  });
  await app.register(cookie);
  await app.register(rateLimit, { max: 120, timeWindow: '1 minute' });

  app.setErrorHandler((err, req, reply) => {
    if ((err as { validation?: unknown }).validation) {
      return reply.code(400).send({ error: 'validation', message: 'Requête invalide.' });
    }
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 429) {
      return reply.code(429).send({ error: 'rate_limited', message: 'Trop de tentatives, réessayez dans une minute.' });
    }
    if (status && status >= 400 && status < 500) {
      return reply.code(status).send({ error: 'client', message: 'Requête refusée.' });
    }
    req.log.error({ err: (err as Error).message }, 'erreur serveur');
    return reply.code(500).send({ error: 'server', message: 'Une erreur est survenue. Réessayez dans quelques instants.' });
  });

  app.addHook('onSend', async (req, reply) => {
    if (req.url.startsWith('/api/')) reply.header('Cache-Control', 'no-store');
  });

  app.get('/healthz', async () => ({ ok: true }));
  const auth = registerAuthRoutes(app, deps, deps.throttle ?? new LoginThrottle());
  registerAccueilRoutes(app, deps, auth.requireUser);
  registerAdminRoutes(app, deps, auth.requireUser);

  // Front (build Vite) : fichiers statiques + repli sur index.html.
  if (deps.webDist && existsSync(join(deps.webDist, 'index.html'))) {
    await app.register(fastifyStatic, { root: deps.webDist, index: false });
    app.get('/', (_req, reply) => reply.header('Cache-Control', 'no-store').sendFile('index.html'));
    app.setNotFoundHandler((req, reply) => {
      if (req.method !== 'GET' || req.url.startsWith('/api/')) {
        return reply.code(404).send({ error: 'not_found' });
      }
      return reply.header('Cache-Control', 'no-store').sendFile('index.html');
    });
  }

  return app;
}
