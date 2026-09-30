import { EnTetePage } from '@/components/EnTetePage';
import { RarityChip } from '@/components/ui';
import Link from 'next/link';
import { CARDS, RARITY_META, cartesDuPack } from '@/lib/domain/catalog';
import { getStore } from '@/lib/db/store';
import { exigeSession } from '@/lib/auth/acces';
import {
  CARD_IMPACT_CAP,
  CHANCE,
  CRENEAUX_BONUS,
  IMPACT_PAR_RARETE,
  DEFAULT_MAX_GAMES_PER_PLAYER,
  DUEL,
  ECONOMY,
  EVENEMENTS_SUBS,
  PACKS_REGLES,
  PLACEMENT_POINTS,
  rarityPercent,
  SEASON,
  SUB_MILESTONES,
} from '@/lib/domain/rules';
import type { Rarity } from '@/lib/domain/types';
import { resolvedPacks } from '@/lib/services/packs';
import { TitreGlace } from '@/components/TitreGlace';

export const metadata = { title: 'Règles de la saison' };

const LADDER: Rarity[] = ['C', 'PC', 'R', 'SR', 'UR', 'L'];

function Rule({
  title,
  lead,
  children,
}: {
  title: string;
  lead?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="glass p-5 2xl:mb-5 2xl:break-inside-avoid">
      <TitreGlace taille="petit">{title}</TitreGlace>
      {lead && <p className="mt-0.5 text-xs text-faint">{lead}</p>}
      <div className="mt-3 space-y-2.5 text-sm leading-relaxed text-muted">{children}</div>
    </section>
  );
}

/**
 * Règles publiques.
 *
 * Toutes les valeurs sont lues dans `lib/domain/rules` et `catalog`, et les
 * taux dans les packs tels que l'administration les a réglés : cette page ne
 * peut pas mentir, puisqu'elle affiche exactement les nombres que le serveur
 * utilise pour tirer.
 */
export const dynamic = 'force-dynamic';

export default async function ReglesPage(){
  await exigeSession();
  const { packs, maxGames } = await getStore().read((db) => ({
    packs: resolvedPacks(db),
    maxGames: db.config.maxGamesPerPlayer,
  }));

  return (
    <div className="space-y-4">
      <EnTetePage
        icone="book"
        eyebrow={SEASON.edition}
        titre="Les règles"
        lead="Tout ce qui compte dans la ligue : le score d’une game, les boosters, les cartes, les flocons, les évènements et les duels."
      />

      {/* Deux colonnes sur grand écran, en flux de colonnes : les blocs n'ont
          pas la même hauteur, une grille laisserait des trous. */}
      <div className="space-y-4 2xl:columns-2 2xl:gap-5 2xl:space-y-0">
        <Rule title="Le score d’une game">
          <p className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 font-display text-base text-ink">
            score = kills + points de classement + cartes
          </p>
          <ul className="list-inside list-disc space-y-1">
            <li>1 kill = 1 point.</li>
            <li>
              Classement : Top 1 <strong className="text-gold">+{PLACEMENT_POINTS['1']}</strong>,
              Top 2 <strong>+{PLACEMENT_POINTS['2']}</strong>, Top 3{' '}
              <strong>+{PLACEMENT_POINTS['3']}</strong>. Sans classement, 0.
            </li>
            <li>
              Une carte tombe sur une game, puis disparaît. Aucune ne fait bouger une game de plus
              de <strong className="text-ink">{CARD_IMPACT_CAP} points</strong>, dans un sens comme
              dans l’autre, et une game ne porte jamais deux cartes.
            </li>
            <li>
              {maxGames} games comptent par joueur
              {maxGames !== DEFAULT_MAX_GAMES_PER_PLAYER ? ' (réglé par la modération)' : ''}. La
              dernière ouvre le Booster Finisseur. Une carte « Game supplémentaire » en ajoute une,{' '}
              {CRENEAUX_BONUS.max} au plus par saison.
            </li>
          </ul>
          <p className="text-xs text-faint">
            Les games sont saisies par la modération d’après le stream. Le score est recalculé par
            le serveur à chaque modification : personne ne peut en imposer un.
          </p>
        </Rule>

        <Rule title="Les boosters" lead="Quatre boosters, une carte chacun, ouverts à l’antenne.">
          <ul className="space-y-2">
            {packs.map((pack) => (
              <li key={pack.id} className="rounded-lg border border-white/10 bg-white/5 p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="font-display text-sm font-bold tracking-wide text-ink uppercase">
                    {pack.glyph} {pack.name}
                  </h3>
                  <span className="text-xs text-faint">{cartesDuPack(pack.id).length} cartes</span>
                </div>
                <p className="mt-1 text-xs">{pack.declencheur}</p>
                <p className="mt-0.5 text-xs text-aurora">
                  Pour {pack.pourQui}.{pack.portee === 'JOUEUR' ? ' Uniquement des bonus.' : ''}
                </p>
                <p className="num mt-1.5 text-xs text-faint">
                  {LADDER.filter((r) => pack.weights[r] > 0)
                    .map(
                      (r) =>
                        `${RARITY_META[r].short} ${rarityPercent(pack.weights, r).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} %`,
                    )
                    .join(' · ')}
                </p>
              </li>
            ))}
          </ul>
          <p>
            Personne n’achète de booster. Un Booster Perso est dû tous les{' '}
            <strong className="text-ink">{PACKS_REGLES.persoTousLes} subs offerts</strong> par un
            même joueur. Les boosters de la ligue tombent aux paliers de subs. La streameuse les
            ouvre depuis la file, un par un.
          </p>
          <p className="text-xs text-faint">
            La chance vient des flocons : le multiplicateur monte de ×1 à ×2 avec le solde, et
            atteint ×2 au plafond de {CHANCE.floconsPourPlein.toLocaleString('fr-FR')} flocons. À
            ×2, les raretés hautes sont deux fois plus probables, pas davantage — une rare n’est
            jamais garantie. Les flocons ne sont pas dépensés, et la chance ne s’applique jamais à un
            booster collectif.
          </p>
        </Rule>

        <Rule
          title="Les cartes"
          lead="Les actions des roues de la Summer Ligue, à la mesure de l’hiver."
        >
          <p>
            {CARDS.length} cartes. Chacune porte un nom d’hiver et l’intitulé de son action —
            « Multiplicateur game », « Joker », « Clone kill du meilleur ». Ce qui a changé par
            rapport aux roues, c’est la force : une carte pèse ce que sa rareté autorise.
          </p>
          <ul className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {LADDER.map((r) => (
              <li
                key={r}
                className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs"
              >
                <RarityChip rarity={r} />
                <span className="min-w-0 flex-1 truncate text-ink">{RARITY_META[r].label}</span>
                <strong className="num text-ink">{IMPACT_PAR_RARETE[r]} pts</strong>
              </li>
            ))}
          </ul>
          <p className="text-xs text-faint">
            Ce qu’une carte peut faire bouger sur une game, au plus. Les flocons, la game
            supplémentaire et l’immunité ne touchent pas au score.
          </p>

          <h3 className="pt-1 font-display text-sm font-bold tracking-wide text-ink uppercase">
            Quand une carte se joue
          </h3>
          <ul className="list-inside list-disc space-y-1">
            <li>
              <strong className="text-ink">Sur ta prochaine game</strong>, le plus souvent : elle
              s’y applique à la saisie, puis disparaît. Une seule carte active à la fois ; les
              suivantes attendent, une par game.
            </li>
            <li>
              <strong className="text-ink">Sur une game déjà jouée</strong> : « Pire game ×2 »,
              « Pire game ramenée à la moyenne », « Meilleure game ×1,5 ». Elle tombe dès que tu as
              deux games, dont une sans carte.
            </li>
            <li>
              <strong className="text-ink">Tout de suite</strong> : les flocons, la game
              supplémentaire, l’immunité.
            </li>
            <li>
              Si tu as joué toutes tes games, une carte de prochaine game tombe sur une game déjà
              jouée : un bonus là où il rapporte le plus, un malus sur la plus récente.
            </li>
          </ul>

          <h3 className="pt-1 font-display text-sm font-bold tracking-wide text-ink uppercase">
            Les malus
          </h3>
          <ul className="list-inside list-disc space-y-1">
            <li>
              Un malus ne sort jamais d’un Booster Perso ni d’un Booster Finisseur : ce qu’on ouvre
              pour soi ne peut pas se retourner contre soi.
            </li>
            <li>
              Il tombe sur un joueur tiré au sort ou sur la tête du classement — jamais sur
              quelqu’un que quelqu’un aurait choisi. Il retire des points, il n’en donne à personne.
            </li>
            <li>
              Il ne touche que la prochaine game de sa cible. Rien n’est supprimé, volé ni copié
              chez un autre.
            </li>
            <li>
              <strong className="text-ink">L’immunité</strong> pare tout malus qui tombe sur une de
              tes games tant qu’elle court. Les bonus t’atteignent toujours.
            </li>
            <li>
              Le Chassé-Croisé oppose deux joueurs tirés au sort : ils échangent les kills de leur
              prochaine game, et la carte se règle quand la seconde est saisie. Ce que l’un gagne,
              l’autre le perd, borné de chaque côté.
            </li>
            <li>La streameuse ne joue pas : aucune carte ne tombe jamais sur elle.</li>
          </ul>
          <p>
            <Link href="/boosters" className="font-semibold text-aurora">
              Toutes les cartes, booster par booster →
            </Link>
          </p>
        </Rule>

        <Rule title="Les flocons ❄" lead="Ils se gagnent en jouant, et se risquent en duel.">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-white/10 bg-white/5 p-3">
              <h3 className="font-display text-sm font-bold tracking-wide text-ink uppercase">
                1. Le jeu — ce qui crée l’écart
              </h3>
              <ul className="mt-1.5 list-inside list-disc space-y-0.5 text-xs">
                <li>{ECONOMY.perKill} ❄ par kill</li>
                <li>
                  {ECONOMY.perPlacement['1']} ❄ pour un Top 1, {ECONOMY.perPlacement['2']} ❄ pour
                  un Top 2, {ECONOMY.perPlacement['3']} ❄ pour un Top 3
                </li>
                <li>{ECONOMY.participation} ❄ par game enregistrée</li>
                <li>{ECONOMY.welcomeGrant} ❄ offerts à l’inscription</li>
              </ul>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/5 p-3">
              <h3 className="font-display text-sm font-bold tracking-wide text-ink uppercase">
                2. Les subs Twitch — pour tout le monde
              </h3>
              <ul className="mt-1.5 space-y-1 text-xs">
                {SUB_MILESTONES.map((m) => (
                  <li key={m.every}>
                    <strong className="text-ink">Tous les {m.every} subs</strong> — {m.label} :{' '}
                    {m.description}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <p>
            Les flocons servent à deux choses : miser dans les duels, et pousser les raretés
            quand un booster s’ouvre pour soi. Rien d’autre ne s’achète. Le solde plafonne à{' '}
            <strong className="text-ink">{ECONOMY.soldeMax.toLocaleString('fr-FR')} ❄</strong> :
            ce qui dépasse est perdu.
          </p>
        </Rule>

        <Rule title="Les évènements" lead="Aux paliers de subs, les règles changent une heure ou deux.">
          <ul className="space-y-1 text-xs">
            {EVENEMENTS_SUBS.map((e) => (
              <li key={`${e.every}-${e.kind}`}>
                <strong className="text-ink">Tous les {e.every} subs</strong> — {e.label} :{' '}
                {e.description}
              </li>
            ))}
          </ul>
          <p className="text-xs text-faint">
            Tout le monde en profite, et personne plus qu’un autre. Deux évènements du même genre ne
            se cumulent pas.
          </p>
        </Rule>

        <Rule title="Les duels" lead="Deux joueurs, la même mise, le gagnant rafle tout.">
          <ul className="list-inside list-disc space-y-1">
            <li>
              Mise de {DUEL.miseMin} à {DUEL.miseMax.toLocaleString('fr-FR')} ❄, en une seule manche.
            </li>
            <li>
              Chacun pousse sa boule de neige. Le premier qui tombe a perdu : le serveur tire le
              vainqueur, une chance sur deux pour chacun.
            </li>
            <li>
              Le gagnant rafle les deux mises. Le perdant perd toute sa mise. Aucune carte n’entre en
              jeu.
            </li>
            <li>
              Un duel se joue entre deux joueurs. Tant que personne ne l’a relevé, tu peux l’annuler : ta
              mise t’est rendue.
            </li>
          </ul>
        </Rule>

        <Rule title="Les raretés" lead="Six paliers, du banal au convoité.">
          <ul className="space-y-1">
            {LADDER.map((r) => (
              <li key={r} className="flex items-center gap-2 text-xs">
                <RarityChip rarity={r} />
                <span className="text-ink">{RARITY_META[r].label}</span>
                <span className="num ml-auto text-faint">
                  {CARDS.filter((c) => c.rarity === r).length} cartes
                </span>
              </li>
            ))}
          </ul>
        </Rule>

        <Rule title="Classement et finale">
          <ul className="list-inside list-disc space-y-1">
            <li>Le classement additionne les games comptées de chaque joueur.</li>
            <li>
              À égalité : le plus de Top 1, puis le plus de kills, puis la meilleure game, puis
              l’ordre alphabétique.
            </li>
            <li>
              Les <strong className="text-ink">{SEASON.finalistCount} premiers</strong> se
              qualifient pour la finale.
            </li>
          </ul>
        </Rule>
      </div>
    </div>
  );
}
