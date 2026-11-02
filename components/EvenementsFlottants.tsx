import { Countdown } from '@/components/Countdown';
import { EmblemePalier } from '@/components/EmblemePalier';
import type { EvenementActif } from '@/lib/db/entities';
import { EVENEMENTS_SUBS } from '@/lib/domain/rules';

/**
 * Les évènements de subs en cours — une Tempête de neige, en pratique :
 * l'Avalanche est instantanée et ne dure pas.
 *
 *  - **menu** — sur ordinateur, dans la colonne de gauche, au-dessus du
 *    compte : une tuile par évènement, la médaille, le nom, ce qu'il fait, et
 *    le temps qui reste. Il occupait tout un bandeau en tête de chaque page
 *    (déplacé le 02/11/2026) ;
 *  - **bandeau** — sur téléphone et tablette, où la colonne n'existe pas : le
 *    bandeau en tête de page, un segment par évènement, caché à partir de lg.
 *
 * Il n'existe que quand quelque chose tourne. Composant serveur ; seul le
 * compte à rebours vit dans le navigateur.
 */
export function EvenementsFlottants({
  evenements,
  variante,
}: {
  evenements: EvenementActif[];
  variante: 'menu' | 'bandeau';
}) {
  if (evenements.length === 0) return null;
  const vues = evenements.map((e) => {
    // Le texte vient de la table, pas de l'enregistrement : un évènement
    // ouvert avant une reformulation garde sinon l'ancienne phrase.
    const regle = EVENEMENTS_SUBS.find((r) => r.kind === e.kind && r.label === e.label);
    const tempete = e.kind === 'COMMU_ACCELERE';
    return {
      e,
      description: regle?.description ?? e.description,
      glyphe: tempete ? ('tempete' as const) : ('flocons' as const),
      teinte: tempete ? 'var(--ice)' : 'var(--aurora)',
    };
  });

  if (variante === 'menu') {
    return (
      <section className="menu-evts" aria-label="Évènements en cours">
        {vues.map(({ e, description, glyphe, teinte }) => (
          <div key={e.id} className="menu-evt" style={{ ['--teinte' as string]: teinte }}>
            <div className="menu-evt-tete">
              <EmblemePalier glyphe={glyphe} teinte={teinte} id={`menu-evt-${e.id}`} className="menu-evt-embleme" />
              <div className="min-w-0">
                <span className="menu-evt-statut">
                  <span className="evenement-pastille" aria-hidden="true" />
                  En cours
                </span>
                <strong className="menu-evt-nom">{e.label}</strong>
              </div>
            </div>
            <p className="menu-evt-description">{description}</p>
            <p className="menu-evt-temps">
              <span className="menu-evt-reste">reste</span>
              <span className="num">
                <Countdown endsAt={e.endsAt} />
              </span>
            </p>
          </div>
        ))}
      </section>
    );
  }

  return (
    <section className="bandeau-evts lg:hidden" aria-label="Évènements en cours">
      {vues.map(({ e, description, glyphe, teinte }) => (
        <div key={e.id} className="bandeau-evt" style={{ ['--teinte' as string]: teinte }}>
          <EmblemePalier glyphe={glyphe} teinte={teinte} id={`evt-${e.id}`} className="bandeau-evt-embleme" />
          <div className="bandeau-evt-texte">
            <span className="bandeau-evt-tete">
              <span className="evenement-pastille" aria-hidden="true" />
              <span className="bandeau-evt-statut">En cours</span>
              <strong className="bandeau-evt-nom">{e.label}</strong>
            </span>
            <span className="bandeau-evt-description">{description}</span>
          </div>
          <div className="bandeau-evt-temps">
            <span className="bandeau-evt-reste">reste</span>
            <span className="num">
              <Countdown endsAt={e.endsAt} />
            </span>
          </div>
        </div>
      ))}
    </section>
  );
}
