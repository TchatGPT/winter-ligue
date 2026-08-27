import { PageHead, RarityChip, flakes } from '@/components/ui';
import { BOOSTERS, RARITY_META, THEMES } from '@/lib/domain/catalog';
import {
  atLeastOnePercent,
  ECONOMY,
  CARD_IMPACT_CAP,
  MALUS,
  MARKET,
  PLACEMENT_POINTS,
  rarityPercent,
  RARITY_WEIGHTS_BASE,
  SEASON,
  SET_TIERS,
  SUB_MILESTONES,
} from '@/lib/domain/rules';
import type { Rarity, ThemeId } from '@/lib/domain/types';

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
    <section className="glass p-5">
      <h2 className="font-display text-lg font-black tracking-wide text-ice uppercase">{title}</h2>
      {lead && <p className="mt-0.5 text-xs text-faint">{lead}</p>}
      <div className="mt-3 space-y-2.5 text-sm leading-relaxed text-muted">{children}</div>
    </section>
  );
}

/**
 * Règles publiques.
 *
 * Toutes les valeurs sont lues dans `lib/domain/rules` et `catalog` : cette page
 * ne peut pas mentir sur les taux, puisqu'elle affiche exactement les nombres
 * que le serveur utilise pour tirer.
 */
export default function ReglesPage() {
  return (
    <div className="space-y-4">
      <PageHead eyebrow={SEASON.edition} title="Les" accent="Règles" />

      <Rule title="Le score d’une game">
        <p className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 font-display text-base text-ink">
          score = (kills × multiplicateur) + points de classement + bonus
        </p>
        <ul className="list-inside list-disc space-y-1">
          <li>1 kill = 1 point de base.</li>
          <li>
            Classement : Top 1 <strong className="text-gold">+{PLACEMENT_POINTS['1']}</strong>,
            Top 2 <strong>+{PLACEMENT_POINTS['2']}</strong>, Top 3{' '}
            <strong>+{PLACEMENT_POINTS['3']}</strong>. Sans classement, 0.
          </li>
          <li>
            Le multiplicateur ne s’applique <em>qu’aux kills</em>. Les points de classement restent
            fixes.
          </li>
          <li>
            Chaque carte annonce son plafond : « ×1,5 jusqu’à +18 points » ne donnera jamais
            plus de 18 points, même sur une game à 40 kills.
          </li>
          <li>
            Aucune carte ne peut faire bouger un total de plus de{' '}
            <strong className="text-ink">{CARD_IMPACT_CAP} points</strong>, soit une bonne game.
          </li>
        </ul>
        <p className="text-xs text-faint">
          Les games sont saisies par la modération d’après le stream. Le score est recalculé par le
          serveur à chaque modification : personne ne peut en imposer un.
        </p>
      </Rule>

      <Rule
        title="Les flocons ❄"
        lead="Deux sources, et cette séparation est le cœur de l’équilibre."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-white/10 bg-white/5 p-3">
            <h3 className="font-display text-sm font-bold tracking-wide text-ink uppercase">
              1. Le jeu — ce qui crée l’écart
            </h3>
            <ul className="mt-1.5 list-inside list-disc space-y-0.5 text-xs">
              <li>{ECONOMY.perKill} ❄ par kill</li>
              <li>
                {ECONOMY.perPlacement['1']} ❄ pour un Top 1, {ECONOMY.perPlacement['2']} ❄ pour un
                Top 2, {ECONOMY.perPlacement['3']} ❄ pour un Top 3
              </li>
              <li>{ECONOMY.participation} ❄ par game enregistrée</li>
              <li>{ECONOMY.welcomeGrant} ❄ offerts à l’inscription</li>
            </ul>
            <p className="mt-2 text-xs text-faint">
              C’est la <strong className="text-muted">seule</strong> source qui rend un joueur plus
              riche qu’un autre.
            </p>
          </div>

          <div className="rounded-lg border border-white/10 bg-white/5 p-3">
            <h3 className="font-display text-sm font-bold tracking-wide text-ink uppercase">
              2. Les subs Twitch — pour tout le monde
            </h3>
            <ul className="mt-1.5 space-y-1 text-xs">
              {SUB_MILESTONES.map((m) => (
                <li key={m.every} className="flex gap-2">
                  <span className="num shrink-0 font-display font-black text-violet">
                    {m.every}
                  </span>
                  <span>
                    <strong className="text-ink">{m.label}</strong> — {m.description}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-faint">
              Ces récompenses tombent à chaque palier atteint, pour{' '}
              <strong className="text-muted">tous les joueurs actifs à parts égales</strong>.
            </p>
          </div>
        </div>

        <p className="rounded-lg border border-ice/25 bg-ice/5 px-3 py-2 text-xs">
          <strong className="text-ice">Pourquoi ce n’est pas du pay-to-win.</strong> Un gifteur ne
          peut créditer aucun joueur en particulier : les flocons de subs se répartissent également.
          Le chat fait grossir l’économie entière — plus de boosters, un marché plus vivant — mais
          le classement, lui, ne bouge qu’avec des kills. Un gifteur peut tout de même désigner un
          joueur à partir de {5} subs : celui-ci reçoit alors une{' '}
          <strong className="text-muted">carte commune au hasard</strong>, jamais des flocons.
        </p>
      </Rule>

      <Rule title="Les raretés" lead="Six paliers, du banal au convoité.">
        <div className="scroll-x">
          <table className="grid-table min-w-[560px]">
            <thead>
              <tr>
                <th className="w-12">Sigle</th>
                <th>Rareté</th>
                <th className="text-right">Chance par carte</th>
                <th className="text-right">Au moins une par booster de 5</th>
              </tr>
            </thead>
            <tbody>
              {LADDER.map((rarity) => {
                const meta = RARITY_META[rarity];
                const per = rarityPercent(RARITY_WEIGHTS_BASE, rarity);
                const atLeast = atLeastOnePercent(RARITY_WEIGHTS_BASE, rarity, 5);
                return (
                  <tr key={rarity}>
                    <td>
                      <RarityChip rarity={rarity} />
                    </td>
                    <td style={{ color: meta.color }}>{meta.label}</td>
                    <td className="num text-right text-ink">
                      {per < 0.1 ? per.toFixed(3) : per < 1 ? per.toFixed(2) : per.toFixed(1)} %
                    </td>
                    <td className="num text-right text-muted">
                      {atLeast < 0.1 ? atLeast.toFixed(3) : atLeast.toFixed(1)} %
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-faint">
          Taux du booster Givre. Les boosters plus chers déplacent la courbe vers le haut et
          garantissent un palier minimum. Le tirage est effectué par le serveur avec une source
          aléatoire cryptographique — ni observable, ni rejouable.
        </p>
      </Rule>

      <Rule title="Les boosters">
        <div className="scroll-x">
          <table className="grid-table min-w-[600px]">
            <thead>
              <tr>
                <th>Booster</th>
                <th className="text-right">Prix</th>
                <th className="text-right">Effets</th>
                <th className="text-right">Collection</th>
                <th>Garantie</th>
                <th className="text-right">Chance légendaire</th>
              </tr>
            </thead>
            <tbody>
              {BOOSTERS.map((b) => (
                <tr key={b.id}>
                  <td className="text-ink">
                    <span aria-hidden="true">{b.glyph}</span> {b.name}
                  </td>
                  <td className="num text-right text-ice">❄ {flakes(b.price)}</td>
                  <td className="num text-right text-ink">{b.slots.effet}</td>
                  <td className="num text-right text-muted">{b.slots.collection}</td>
                  <td>
                    {b.guaranteed ? (
                      <span className="flex items-center gap-1.5">
                        <RarityChip rarity={b.guaranteed} />
                        <span className="text-xs text-muted">minimum</span>
                      </span>
                    ) : (
                      <span className="text-faint">—</span>
                    )}
                  </td>
                  <td className="num text-right text-gold">
                    {atLeastOnePercent(b.weights, 'L', b.slots.effet).toFixed(2)} %
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Rule>

      <Rule title="Les cartes : bonus et malus">
        <p>
          24 cartes, 4 familles × 6 raretés. Une carte est soit un{' '}
          <strong className="text-ink">bonus</strong> à jouer sur soi, soit un{' '}
          <strong className="text-danger">malus</strong> à poser sur un adversaire.
        </p>
        <ul className="list-inside list-disc space-y-1">
          <li>Une carte jouée est consommée.</li>
          <li>
            <strong className="text-ink">Aucune carte ne peut faire bouger un total de plus de{' '}
            {CARD_IMPACT_CAP} points</strong>, soit une bonne game. Chaque carte annonce son
            plafond dans son texte.
          </li>
          <li>
            <strong className="text-ink">Un malus retire des points, il n’en donne jamais à
            l’attaquant.</strong> Aucune carte ne copie ni ne vole la game de quelqu’un.
          </li>
          <li>
            Une game <strong>gelée</strong> ne peut plus être touchée par un malus.
          </li>
          <li>
            Un <strong>bouclier</strong> rend son porteur intouchable pendant sa durée. Deux
            boucliers se cumulent en durée, pas en épaisseur.
          </li>
          <li>
            <strong>Second Souffle</strong> annule le dernier malus subi dans les{' '}
            {MALUS.undoWindowHours} h et rend les points : tout malus a une réponse.
          </li>
        </ul>

        <div className="rounded-lg border border-white/10 bg-white/5 p-3">
          <h3 className="font-display text-sm font-bold tracking-wide text-ink uppercase">
            Protection contre l’acharnement
          </h3>
          <ul className="mt-1.5 list-inside list-disc space-y-1 text-xs">
            <li>
              N’importe qui peut viser n’importe qui — il n’y a pas de restriction de classement.
            </li>
            <li>
              Mais on ne peut pas viser deux fois le même joueur en moins de{' '}
              {MALUS.cooldownHours} heures.
            </li>
            <li>
              Et surtout : un joueur ne peut pas encaisser plus de{' '}
              <strong className="text-ink">{MALUS.maxReceivedPerDay} malus par 24 h</strong>, toutes
              sources confondues. Sans ce plafond, sept joueurs pourraient enchaîner sept malus sur
              le leader le même soir, et mener deviendrait une punition.
            </li>
          </ul>
        </div>
      </Rule>

      <Rule
        title="Les familles et leurs bonus permanents"
        lead={`Deux paliers : ${SET_TIERS.partial} cartes sur 6, puis les 6.`}
      >
        <p>
          Posséder une carte suffit — même si tu l’as ensuite jouée ou revendue. La{' '}
          <strong className="text-ink">découverte est définitive</strong>, les bonus de famille sont
          donc un acquis.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {(Object.keys(THEMES) as ThemeId[]).map((id) => {
            const theme = THEMES[id];
            return (
              <div
                key={id}
                className="rounded-lg border border-white/10 bg-white/5 p-3"
                style={{ borderLeft: `3px solid ${theme.color}` }}
              >
                <div
                  className="font-display text-sm font-bold tracking-wide uppercase"
                  style={{ color: theme.color }}
                >
                  <span aria-hidden="true">{theme.glyph}</span> {theme.name}
                </div>
                <dl className="mt-1.5 space-y-0.5 text-xs">
                  <div className="flex gap-2">
                    <dt className="num shrink-0 text-faint">4/6</dt>
                    <dd className="text-muted">{theme.partialBonusLabel}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="num shrink-0 text-faint">6/6</dt>
                    <dd className="text-ink">{theme.fullBonusLabel}</dd>
                  </div>
                </dl>
              </div>
            );
          })}
        </div>
        <p className="text-xs text-faint">
          Le palier à 4 cartes existe pour une raison simple : la légendaire d’une famille sort une
          ouverture sur mille. Exiger les six d’emblée rendrait le bonus décoratif. Il reste
          possible d’acheter les cartes manquantes à l’hôtel des ventes.
        </p>
      </Rule>

      <Rule title="L’hôtel des ventes">
        <ul className="list-inside list-disc space-y-1">
          <li>
            Tu choisis un prix de départ, un achat immédiat facultatif et une durée (
            {MARKET.durationsHours.join(', ')} heures).
          </li>
          <li>
            Enchérir <strong className="text-ink">bloque immédiatement tes flocons</strong>. Ils te
            sont rendus dès que quelqu’un surenchérit.
          </li>
          <li>
            Chaque mise doit dépasser la précédente d’au moins {MARKET.minIncrementFlat} ❄ ou{' '}
            {Math.round(MARKET.minIncrementRate * 100)} %, la plus grande des deux valeurs.
          </li>
          <li>
            Une mise dans la dernière minute repousse la clôture d’une minute : le sniping ne sert à
            rien.
          </li>
          <li>
            Taxe de {Math.round(MARKET.feeRate * 100)} % prélevée au vendeur, réduite de moitié
            avec la famille Solstice complète.
          </li>
          <li>Une vente ne peut être retirée que si personne n’a encore misé.</li>
          <li>
            Une carte mise en vente est verrouillée : impossible de la jouer avant la fin de la
            vente.
          </li>
          <li>
            {MARKET.maxActiveListingsPerPlayer} ventes actives maximum par joueur, en même temps.
          </li>
        </ul>
      </Rule>

      <Rule title="Classement et finale">
        <p>
          Le total de saison est la somme des games comptabilisées. Une game « passée » par la
          modération reste visible mais ne compte pas.
        </p>
        <p>
          Égalité départagée par le nombre de Top 1, puis les kills cumulés, puis la meilleure game.
        </p>
        <p>
          Les <strong className="text-gold">{SEASON.finalistCount} premiers</strong> sont qualifiés
          pour la finale.
        </p>
      </Rule>
    </div>
  );
}
