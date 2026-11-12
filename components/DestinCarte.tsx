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

/** « 4 joueurs », « 1 joueur ». */
const joueurs = (n: number) => `${n} joueur${n > 1 ? 's' : ''}`;

/** « +10 pts », « −4 pts », « 1 pt ». */
function enPoints(n: number): string {
  const signe = n > 0 ? '+' : n < 0 ? '−' : '';
  return `${signe}${Math.abs(n)} pt${Math.abs(n) > 1 ? 's' : ''}`;
}

/** Le résultat sans ses points de la fin (« … → +14 pts ») : la pastille les dit déjà. */
const sansLesPoints = (resultat: string) => resultat.replace(/ → [+−-]?\d+ pts?$/, '');

/**
 * Le compte rendu d'une ouverture (12/11/2026) : qui gagne, qui perd, et
 * quoi — joueur par joueur, la game touchée nommée, les points au total. En
 * tête, le décompte : « 4 joueurs gagnent · 4 joueurs perdent ».
 */
function CompteRendu({ effets, autres }: { effets: Destin['effets']; autres: number }) {
  const gains = effets.filter((e) => e.sens === 'gain').length;
  const pertes = effets.filter((e) => e.sens === 'perte').length;
  const neutres = effets.filter((e) => e.sens === 'neutre').length;
  return (
    <div className="compte-rendu">
      {effets.length > 1 && (
        <p className="compte-rendu-decompte">
          {gains > 0 && (
            <span data-sens="gain">
              ▲ {gains} {gains > 1 ? 'gagnent' : 'gagne'}
            </span>
          )}
          {pertes > 0 && (
            <span data-sens="perte">
              ▼ {pertes} {pertes > 1 ? 'perdent' : 'perd'}
            </span>
          )}
          {neutres > 0 && <span data-sens="neutre">= {neutres} sans effet</span>}
        </p>
      )}
      <ul className="compte-rendu-liste">
        {effets.map((e, i) => (
          <li key={`${e.pseudo}-${i}`} className="compte-rendu-ligne" data-sens={e.sens}>
            <span className="compte-rendu-badge num" aria-hidden="true">
              {e.bilan !== null && e.bilan !== 0 ? enPoints(e.bilan) : e.sens === 'neutre' ? '=' : e.sens === 'gain' ? '▲' : '▼'}
            </span>
            <span className="compte-rendu-texte">
              <strong>{e.pseudo}</strong>
              <span>{e.bilan ? sansLesPoints(e.resultat) : e.resultat}</span>
            </span>
          </li>
        ))}
      </ul>
      {autres > 0 && <p className="compte-rendu-autres">…et {joueurs(autres)} de plus.</p>}
    </div>
  );
}

export function DestinCarte({ o }: { o: Destin }) {
  const qui = o.pseudo ? o.pseudo : o.tous ? 'chaque joueur en lice' : liste(o.beneficiaires);
  const autres = o.regles - o.effets.length;

  if (o.effets.length > 0 && o.enAttente === 0) return <CompteRendu effets={o.effets} autres={autres} />;

  return (
    <Notice kind={o.nature === 'malus' ? 'error' : 'success'}>
      {o.effets.length > 0 && <CompteRendu effets={o.effets} autres={autres} />}

      {o.enAttente > 0 && (
        <p className={o.effets.length > 0 ? 'mt-1.5' : undefined}>
          {o.moment === 'INSTANT' ? (
            <>
              Pour <strong>{qui}</strong> : versé dès la carte révélée.
            </>
          ) : o.moment === 'GARDEE' ? (
            <>
              <strong>{qui}</strong> garde son Joker : à la saisie d’une de ses games, la modération pourra la
              faire ne pas compter.
            </>
          ) : o.moment === 'JOUEE' ? (
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
