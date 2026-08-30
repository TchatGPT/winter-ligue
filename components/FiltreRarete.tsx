'use client';

import { rarityMeta } from '@/components/ui';
import { RARITY_WEIGHTS_BASE, rarityPercent } from '@/lib/domain/rules';
import { RARITIES, type Rarity } from '@/lib/domain/types';

/**
 * Une cote en pourcentage, lisible d'un palier à l'autre.
 *
 * Le nombre de décimales suit l'ordre de grandeur : arrondir à l'entier
 * donnerait « 6 % » pour une rare qui sort à 5,7, et « 0 % » pour une
 * légendaire — c'est-à-dire le contraire de ce qu'on veut montrer. Le zéro
 * final est retiré pour qu'une super rare affiche « 1 % » et non « 1,0 % ».
 *
 * Formatage à la main plutôt que `toLocaleString` : Node et les navigateurs ne
 * produisent pas la même chaîne, ce qui casserait l'hydratation.
 */
function cote(valeur: number): string {
  const decimales = valeur < 1 ? 2 : valeur < 10 ? 1 : 0;
  return `${valeur.toFixed(decimales).replace(/\.0$/, '').replace('.', ',')} %`;
}

/**
 * Le panneau de filtre par rareté.
 *
 * Six paliers à bascule, un bouton pour tout rouvrir, et la cote de chacun. Il
 * vivait dans l'hôtel des ventes ; le catalogue et la collection en avaient
 * besoin à leur tour, et trois copies d'un même filtre finissent toujours par
 * diverger — un ordre ici, une teinte là.
 *
 * ## Un panneau, pas une barre de pastilles
 *
 * La première version était une rangée de pastilles hautes d'une ligne. Elle
 * ratait deux choses. Elle n'avait l'air de rien — trop mince pour se lire
 * comme une commande, elle passait pour une légende décorative. Et surtout elle
 * ne disait pas ce qu'elle triait : « Ultra rare » ne veut rien dire tant qu'on
 * ne sait pas qu'il s'agit de trois cartes sur mille.
 *
 * Chaque palier porte donc sa **cote de base** — sa probabilité sur une carte
 * de booster, table `RARITY_WEIGHTS_BASE`. C'est la définition opérationnelle
 * de la rareté dans ce jeu, et elle a sa place ici plutôt que dans une page de
 * règles qu'on ne lit qu'une fois.
 *
 * ## Des mots, pas les gemmes de rareté
 *
 * Les pastilles dessinées de `RarityIcon` tiennent leur rôle sur une carte, où
 * la couleur du cadre et le sigle disent déjà la rareté et où la gemme ne fait
 * que confirmer. Isolées sur un filtre, elles demandent de connaître par cœur
 * la correspondance entre six formes et six paliers — et une infobulle ne se
 * survole pas sur un téléphone. Un filtre doit s'utiliser sans avoir été appris.
 *
 * ## Pourquoi des bascules et non un choix unique
 *
 * On veut souvent voir « les ultra rares et les légendaires » d'un coup, jamais
 * « la troisième rareté seulement ». Un groupe de boutons radio interdirait la
 * première lecture pour n'autoriser que la seconde.
 *
 * Le composant est contrôlé : c'est l'appelant qui tient la sélection. Il en a
 * besoin de toute façon pour filtrer sa propre liste, et un état dupliqué entre
 * le panneau et la grille se désynchronise au premier rendu qui les sépare.
 */
export function FiltreRarete({
  selection,
  onToggle,
  onReset,
  compte,
  aide,
  children,
}: {
  /** Raretés retenues. Vide signifie « toutes », jamais « aucune ». */
  selection: Set<string>;
  onToggle: (rarity: string) => void;
  onReset: () => void;
  /** Annotation propre à chaque palier — « 4 cartes », « 2/4 », selon la grille. */
  compte?: (rarity: Rarity) => string;
  /** Remplace la phrase d'explication par défaut. */
  aide?: React.ReactNode;
  /** Info libre poussée à droite du titre — un décompte, en général. */
  children?: React.ReactNode;
}) {
  return (
    <div className="glass p-3.5 sm:p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-display text-sm font-black tracking-wider text-ink uppercase">
          Filtrer par rareté
        </h3>
        {children && <span className="text-[13px] text-faint">{children}</span>}
      </div>

      {/* De la plus rare à la plus commune : c'est ce qu'on cherche en premier. */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {[...RARITIES].reverse().map((r) => {
          const meta = rarityMeta(r);
          const active = selection.has(r);
          const chance = rarityPercent(RARITY_WEIGHTS_BASE, r);
          return (
            <button
              key={r}
              type="button"
              onClick={() => onToggle(r)}
              aria-pressed={active}
              className="flex flex-col items-start gap-0.5 rounded-lg border px-2.5 py-2 text-left transition-colors"
              style={{
                borderColor: active ? meta.color : 'var(--line-2)',
                color: active ? '#060a12' : meta.color,
                background: active ? meta.color : 'transparent',
              }}
            >
              <span className="font-display text-[12px] leading-tight font-black tracking-[0.06em] uppercase">
                {meta.label}
              </span>
              {/*
               * La seconde ligne est à 90 % d'opacité, et pas moins.
               *
               * Mesure faite sur les six teintes dans les deux états : à 75 %,
               * elle tombait à 3,8:1 sur le violet Rare, qui est le palier le
               * plus sombre. À 90 %, le pire cas remonte à 5,0.
               */}
              <span className="num text-[11.5px] leading-tight opacity-90">
                {compte ? compte(r) : cote(chance)}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="max-w-2xl text-[13px] leading-relaxed text-faint">
          {aide ?? (
            <>
              Le pourcentage est la chance qu’une carte de booster sorte à ce palier. Clique une
              rareté pour ne garder qu’elle&nbsp;; plusieurs se cumulent.
            </>
          )}
        </p>
        {selection.size > 0 && (
          <button className="btn btn-sm btn-ghost shrink-0" onClick={onReset}>
            Tout afficher
          </button>
        )}
      </div>
    </div>
  );
}
