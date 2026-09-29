import { Notice } from '@/components/ui';
import type { OuvertureVue } from '@/lib/services/packs';

/**
 * Où la carte est tombée, et ce qu'elle a déjà fait.
 *
 * Toutes les cartes ne se posent plus sur la prochaine game : des flocons, un
 * créneau ou une immunité se règlent à l'ouverture, une carte qui relève une
 * game déjà jouée dès qu'elle le peut. L'écran dit donc ce qui s'est passé,
 * joueur par joueur, et ce qui attend encore.
 */
export type Destin = Pick<
  OuvertureVue,
  'pseudo' | 'tous' | 'beneficiaires' | 'moment' | 'effets' | 'regles' | 'enAttente' | 'nature'
>;

/** « A », « A et B », « A, B et C ». */
function liste(noms: string[]): string {
  if (noms.length <= 1) return noms[0] ?? '';
  return `${noms.slice(0, -1).join(', ')} et ${noms[noms.length - 1]}`;
}

export function DestinCarte({ o }: { o: Destin }) {
  const qui = o.pseudo ? o.pseudo : o.tous ? 'chaque joueur en lice' : liste(o.beneficiaires);
  const autres = o.regles - o.effets.length;

  return (
    <Notice kind={o.nature === 'malus' ? 'error' : 'success'}>
      {o.effets.length > 0 && (
        <ul className="space-y-0.5">
          {o.effets.map((e, i) => (
            <li key={`${e.pseudo}-${i}`}>
              <strong>{e.pseudo}</strong> : {e.resultat}
            </li>
          ))}
          {autres > 0 && (
            <li>
              …et {autres} autre{autres > 1 ? 's' : ''} joueur{autres > 1 ? 's' : ''}.
            </li>
          )}
        </ul>
      )}

      {o.enAttente > 0 && (
        <p className={o.effets.length > 0 ? 'mt-1.5' : undefined}>
          {o.moment === 'JOUEE' ? (
            o.regles > 0 ? (
              <>
                {o.enAttente} joueur{o.enAttente > 1 ? 's' : ''} l’attend{o.enAttente > 1 ? 'ent' : ''} encore :
                il faut deux games jouées, dont une sans carte.
              </>
            ) : (
              <>
                En attente pour <strong>{qui}</strong> : elle tombera dès qu’il y aura deux games jouées,
                dont une sans carte.
              </>
            )
          ) : o.regles > 0 ? (
            <>Posée sur la prochaine game des {o.enAttente} autres.</>
          ) : (
            <>
              Posée sur la prochaine game de <strong>{qui}</strong>.
            </>
          )}
        </p>
      )}
    </Notice>
  );
}
