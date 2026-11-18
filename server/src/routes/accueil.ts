import type { FastifyInstance } from 'fastify';
import type { AppDeps } from '../app.ts';
import type { AccueilView } from '../contract.ts';
import { userSections } from '../db.ts';
import type { RequireUser } from './auth.ts';

/**
 * Page d'accueil du Carnet AFYA, en lecture seule. Le contenu reste à définir ; le contrôle
 * d'accès (mot de passe provisoire, rubriques du compte) est déjà en place ici, sur le serveur.
 */
export function registerAccueilRoutes(app: FastifyInstance, deps: AppDeps, requireUser: RequireUser): void {
  app.get('/api/accueil', { preHandler: requireUser }, async (req, reply): Promise<AccueilView | void> => {
    const user = req.user!;
    if (user.must_change_password) {
      return reply.code(403).send({ error: 'password_change_required', message: 'Choisissez votre mot de passe avant de consulter le tableau de bord.' });
    }
    const sections = userSections(user);
    if (!sections.length) {
      return reply.code(403).send({ error: 'no_section', message: "Aucune rubrique n'est ouverte pour ce compte." });
    }
    deps.repo.log('view', user.id);
    return { sections, horodatage: new Date().toISOString() };
  });
}
