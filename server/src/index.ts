import { fileURLToPath } from 'node:url';
import { buildApp } from './app.ts';
import { loadConfig } from './config.ts';
import { Repository } from './db.ts';
import { createMailer } from './mailer.ts';

const config = loadConfig();
const webDist = process.env.WEB_DIST ?? fileURLToPath(new URL('../../web/dist', import.meta.url));
const repo = new Repository(config.dbPath);

const app = await buildApp({
  config,
  repo,
  mailer: createMailer(config.mail),
  webDist,
});

await app.listen({ port: config.port, host: '0.0.0.0' });
app.log.info(`URL publique : ${config.publicBaseUrl}, e-mails : ${config.mail.transport}`);
