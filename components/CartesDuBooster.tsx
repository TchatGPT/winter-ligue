import { CardFrame } from '@/components/CardFrame';
import { RarityChip, rarityMeta } from '@/components/ui';
import { RARITY_ORDER } from '@/lib/domain/rules';
import type { CibleCarte, MomentCarte, Rarity } from '@/lib/domain/types';

/**
 * Les cartes d'un booster, action par action.
 *
 * C'est la planche des roues de la Summer Ligue, à la mesure de l'hiver : une
 * tuile par carte, et sur chacune ce qu'on cherche dans l'ordre où on le
 * cherche — **l'action** d'abord, en titre ; le nom de la carte et sa rareté ;
 * ce qu'elle fait, en clair ; puis quand elle se joue, et sur qui elle tombe.
 *
 * Les cartes sont rangées de la commune à la légendaire : on lit en montant
 * ce que le booster peut donner de plus fort.
 */

export interface CarteDuBooster {
  cardId: string;
  name: string;
  /** L'intitulé de l'action : « Multiplicateur game », « Joker »… */
  action: string;
  rarity: string;
  glyph: string;
  description: string;
  power: number;
  nature: 'bonus' | 'malus';
  moment: MomentCarte;
  cible: CibleCarte;
  /** Ce qu'elle peut faire bouger sur une game, au plus. Nul si elle ne touche pas au score. */
  impact: number | null;
}

const MOMENTS: Record<MomentCarte, string> = {
  PROCHAINE: 'Prochaine game',
  JOUEE: 'Game déjà jouée',
  INSTANT: 'Tout de suite',
};

const CIBLES: Record<CibleCarte, string> = {
  TOUS: 'Toute la ligue',
  HASARD: 'Un joueur tiré au sort',
  DEUX: 'Deux joueurs tirés au sort',
  TETE: 'Le premier du classement',
  QUEUE: 'Les derniers du classement',
};

export function CartesDuBooster({
  nom,
  cartes,
  pourUnJoueur,
}: {
  nom: string;
  cartes: CarteDuBooster[];
  /** Un booster ouvert pour quelqu'un : sa carte va à ce joueur, quelle qu'elle soit. */
  pourUnJoueur: boolean;
}) {
  const rangees = [...cartes].sort(
    (a, b) => RARITY_ORDER[a.rarity as Rarity] - RARITY_ORDER[b.rarity as Rarity] || a.power - b.power,
  );
  const malus = rangees.filter((c) => c.nature === 'malus').length;

  return (
    <div>
      <p className="mb-4 text-[14px] text-muted">
        {rangees.length} cartes dans le {nom}.{' '}
        {pourUnJoueur
          ? 'Uniquement des bonus : ce qu’on ouvre pour soi ne peut pas se retourner contre soi.'
          : `${malus} malus parmi elles : ils tombent sur un joueur tiré au sort ou sur la tête du classement, jamais sur quelqu’un qu’on aurait choisi.`}
      </p>

      <ul className="actions-grille">
        {rangees.map((c) => {
          const meta = rarityMeta(c.rarity);
          return (
            <li
              key={c.cardId}
              className="action-tuile"
              data-nature={c.nature}
              style={{ ['--r' as string]: meta.color }}
            >
              <span className="action-carte" aria-hidden="true">
                <CardFrame
                  cardId={c.cardId}
                  name={c.name}
                  rarity={c.rarity}
                  glyph={c.glyph}
                  nature={c.nature}
                />
              </span>

              <div className="min-w-0">
                <h4 className="action-titre">{c.action}</h4>
                <p className="action-nom">
                  <RarityChip rarity={c.rarity} taille={14} />
                  <span>{c.name}</span>
                  <span className="action-rarete">{meta.label}</span>
                </p>
                <p className="action-texte">{c.description.replace(/^MALUS : /, '')}</p>
                <p className="action-pied">
                  {c.nature === 'malus' && <span data-genre="malus">Malus</span>}
                  <span>{MOMENTS[c.moment]}</span>
                  {!pourUnJoueur && <span>{CIBLES[c.cible]}</span>}
                  {c.impact !== null && <span>{c.impact} pts au plus</span>}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
