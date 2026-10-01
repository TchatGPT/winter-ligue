import { Countdown } from '@/components/Countdown';
import { EmblemePalier } from '@/components/EmblemePalier';
import type { EvenementActif } from '@/lib/db/entities';
import { EVENEMENTS_SUBS } from '@/lib/domain/rules';

/**
 * Les évènements de subs en cours, en tête de chaque page : un bandeau dans le
 * cours de la page — pas une pastille posée sur le décor, qu'on ne voyait pas.
 * Un segment par évènement, teinté de sa couleur : la médaille du bloc des
 * subs, le nom, ce qu'il fait en une phrase, et le temps qui reste, en grand.
 *
 * Il n'existe que quand quelque chose tourne. Sur très grand écran, l'accueil
 * retire sa hauteur (`HAUTEUR_BANDEAU_EVENEMENTS`) de celle de sa grille pour
 * tenir sans défiler. Composant serveur ; seul le compte à rebours vit dans le
 * navigateur.
 */

/** La hauteur du bandeau et de sa marge, que l'accueil retire de la sienne. */
export const HAUTEUR_BANDEAU_EVENEMENTS = '84px';

export function EvenementsFlottants({ evenements }: { evenements: EvenementActif[] }) {
  if (evenements.length === 0) return null;
  return (
    <section className="bandeau-evts" aria-label="Évènements en cours">
      {evenements.map((e) => {
        // Le texte vient de la table, pas de l'enregistrement : un évènement
        // ouvert avant une reformulation garde sinon l'ancienne phrase.
        const regle = EVENEMENTS_SUBS.find((r) => r.kind === e.kind && r.label === e.label);
        const tempete = e.kind === 'COMMU_ACCELERE';
        const teinte = tempete ? 'var(--ice)' : 'var(--aurora)';
        return (
          <div key={e.id} className="bandeau-evt" style={{ ['--teinte' as string]: teinte }}>
            <EmblemePalier glyphe={tempete ? 'tempete' : 'flocons'} teinte={teinte} id={`evt-${e.id}`} className="bandeau-evt-embleme" />
            <div className="bandeau-evt-texte">
              <span className="bandeau-evt-tete">
                <span className="evenement-pastille" aria-hidden="true" />
                <span className="bandeau-evt-statut">En cours</span>
                <strong className="bandeau-evt-nom">{e.label}</strong>
              </span>
              <span className="bandeau-evt-description">{regle?.description ?? e.description}</span>
            </div>
            <div className="bandeau-evt-temps">
              <span className="bandeau-evt-reste">reste</span>
              <span className="num">
                <Countdown endsAt={e.endsAt} />
              </span>
            </div>
          </div>
        );
      })}
    </section>
  );
}
