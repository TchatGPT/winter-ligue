import { Countdown } from '@/components/Countdown';
import type { EvenementActif } from '@/lib/db/entities';
import { EVENEMENTS_SUBS } from '@/lib/domain/rules';

/**
 * Les évènements de subs en cours, en haut du site : une mini-bannière qui
 * flotte au-dessus des pages, en verre transparent — une pastille par
 * évènement, son nom, son effet en trois mots et le temps qui reste.
 *
 * Elle ne prend la place de rien : posée par-dessus, elle laisse la page telle
 * qu'elle est, et disparaît quand rien ne tourne. Composant serveur ; seul le
 * compte à rebours vit dans le navigateur.
 */
export function EvenementsFlottants({ evenements }: { evenements: EvenementActif[] }) {
  if (evenements.length === 0) return null;
  return (
    <div className="evts-flottants" role="status" aria-label="Évènements en cours">
      {evenements.map((e) => {
        // L'effet vient de la table, pas de l'enregistrement : un évènement
        // ouvert avant une reformulation garde sinon l'ancienne.
        const regle = EVENEMENTS_SUBS.find((r) => r.kind === e.kind && r.label === e.label);
        return (
          <div key={e.id} className="evt-flottant" data-genre={e.kind} title={regle?.description ?? e.description}>
            <span className="evenement-pastille" aria-hidden="true" />
            <span className="evt-flottant-nom">{e.label}</span>
            {regle && <span className="evt-flottant-effet">{regle.resume}</span>}
            <span className="evt-flottant-temps num">
              <Countdown endsAt={e.endsAt} />
            </span>
          </div>
        );
      })}
    </div>
  );
}
