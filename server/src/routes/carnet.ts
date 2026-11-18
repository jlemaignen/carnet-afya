import type { FastifyInstance, FastifyReply } from 'fastify';
import type { AppDeps } from '../app.ts';
import { InvalidPatient, cleanPatient, isCodeOf } from '../carnet.ts';
import type { CarnetView, Participant } from '../contract.ts';
import { type UserRow, userSections } from '../db.ts';
import type { RequireUser } from './auth.ts';

type Access = { role: 'trainer'; participant: null } | { role: 'part'; participant: Participant };

/**
 * Rôle du compte pour le carnet. Formateur : lecture de tout. Participant : seulement ses fiches,
 * et seulement si son compte est rattaché à un identifiant AFYA. Sinon, aucun accès.
 */
function access(deps: AppDeps, user: UserRow, reply: FastifyReply): Access | null {
  if (user.must_change_password) {
    reply.code(403).send({ error: 'password_change_required', message: 'Choisissez votre mot de passe avant de consulter le carnet.' });
    return null;
  }
  const sections = userSections(user);
  if (sections.includes('formateur')) return { role: 'trainer', participant: null };
  if (sections.includes('participant')) {
    const participant = deps.repo.participantOfUser(user.id);
    if (participant) return { role: 'part', participant };
    reply.code(403).send({ error: 'no_participant', message: "Ce compte n'est pas encore rattaché à un identifiant AFYA. Contactez un formateur." });
    return null;
  }
  reply.code(403).send({ error: 'no_section', message: "Aucun accès au carnet n'est ouvert pour ce compte." });
  return null;
}

export function registerCarnetRoutes(app: FastifyInstance, deps: AppDeps, requireUser: RequireUser): void {
  app.get('/api/carnet', { preHandler: requireUser }, async (req, reply): Promise<CarnetView | void> => {
    const user = req.user!;
    const a = access(deps, user, reply);
    if (!a) return;
    deps.repo.log('carnet_view', user.id, a.role);
    if (a.role === 'trainer') {
      const participants = deps.repo.listParticipants().map(({ userId: _u, ...p }) => p);
      return { role: 'trainer', participant: null, participants, patients: deps.repo.listPatients() };
    }
    return { role: 'part', participant: a.participant, participants: [a.participant], patients: deps.repo.listPatients(a.participant.id) };
  });

  // Création ou mise à jour d'une fiche entière (identification, complications, évaluations).
  app.put<{ Params: { code: string } }>(
    '/api/carnet/patients/:code',
    { preHandler: requireUser, bodyLimit: 64 * 1024 },
    async (req, reply) => {
      const user = req.user!;
      const a = access(deps, user, reply);
      if (!a) return;
      if (a.role !== 'part') {
        return reply.code(403).send({ error: 'read_only', message: 'Les formateurs consultent le carnet sans le modifier.' });
      }
      const code = req.params.code;
      if (!isCodeOf(code, a.participant.id)) {
        return reply.code(403).send({ error: 'not_yours', message: "Ce code n'appartient pas à votre carnet." });
      }
      const owner = deps.repo.findPatientOwner(code);
      if (owner && owner !== a.participant.id) {
        return reply.code(403).send({ error: 'not_yours', message: "Cette fiche n'appartient pas à votre carnet." });
      }
      try {
        const patient = cleanPatient(req.body, code, a.participant.id);
        deps.repo.savePatient(patient, user.id);
        deps.repo.log(owner ? 'patient_update' : 'patient_create', user.id, code);
        return patient;
      } catch (err) {
        if (err instanceof InvalidPatient) return reply.code(400).send({ error: 'invalid', message: err.message });
        throw err;
      }
    },
  );
}
