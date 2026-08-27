import { BOOSTERS, THEMES } from '@/lib/domain/catalog';
import { ECONOMY, GAME_LIMITS, MALUS_COOLDOWN_HOURS, MARKET, PLACEMENT_POINTS, SEASON } from '@/lib/domain/rules';
import type { ThemeId } from '@/lib/domain/types';

export const metadata = { title: 'Règles de la saison' };

function Rule({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="panel panel-frost p-5">
      <h2 className="font-display text-lg font-black uppercase tracking-wide text-ice">{title}</h2>
      <div className="mt-2 space-y-2 text-sm text-muted">{children}</div>
    </section>
  );
}

/** Règles publiques. Toutes les valeurs sont lues dans `lib/domain/rules` : la page ne peut pas mentir. */
export default function ReglesPage() {
  return (
    <div className="space-y-6">
      <header>
        <p className="eyebrow">{SEASON.edition}</p>
        <h1 className="section-title">
          Les <em>Règles</em>
        </h1>
      </header>

      <Rule title="Le score d’une game">
        <p className="font-display text-base text-ink">
          score = (kills × multiplicateur) + points de classement + bonus
        </p>
        <ul className="list-inside list-disc space-y-1">
          <li>1 kill = 1 point de base.</li>
          <li>
            Classement&nbsp;: Top 1 <strong className="text-gold">+{PLACEMENT_POINTS['1']}</strong>,
            Top 2 <strong>+{PLACEMENT_POINTS['2']}</strong>, Top 3{' '}
            <strong>+{PLACEMENT_POINTS['3']}</strong>. Sans classement, 0.
          </li>
          <li>
            Le multiplicateur ne s’applique <em>qu’aux kills</em>. Les points de classement restent
            fixes.
          </li>
          <li>
            Multiplicateur plafonné à ×{GAME_LIMITS.maxMultiplier}, même en cumulant plusieurs
            cartes sur une même game.
          </li>
        </ul>
        <p className="text-xs text-faint">
          Les games sont saisies par la modération, d’après le stream. Le score est recalculé par le
          serveur à chaque modification&nbsp;: personne ne peut en imposer un.
        </p>
      </Rule>

      <Rule title="Les flocons ❄">
        <p>La monnaie de la saison. On ne les gagne qu’en jouant.</p>
        <ul className="list-inside list-disc space-y-1">
          <li>{ECONOMY.perKill} ❄ par kill</li>
          <li>
            {ECONOMY.perPlacement['1']} ❄ pour un Top 1, {ECONOMY.perPlacement['2']} ❄ pour un
            Top 2, {ECONOMY.perPlacement['3']} ❄ pour un Top 3
          </li>
          <li>{ECONOMY.participation} ❄ pour chaque game enregistrée</li>
          <li>{ECONOMY.welcomeGrant} ❄ offerts à l’inscription</li>
        </ul>
        <p>
          Ils servent à acheter des boosters en boutique, et à acheter ou vendre des cartes à
          l’hôtel des ventes.
        </p>
      </Rule>

      <Rule title="Les cartes : bonus et malus">
        <p>
          16 cartes, réparties en 4 familles et 4 raretés. Une carte est soit un{' '}
          <strong className="text-ink">bonus</strong> à jouer sur soi, soit un{' '}
          <strong className="text-danger">malus</strong> à poser sur un adversaire.
        </p>
        <ul className="list-inside list-disc space-y-1">
          <li>Une carte jouée est consommée.</li>
          <li>
            Une game <strong>gelée</strong> ne peut plus être modifiée, ni par toi, ni par un malus
            adverse.
          </li>
          <li>
            Un <strong>Bouclier de Givre</strong> rend son porteur intouchable par les malus pendant
            24 heures.
          </li>
          <li>
            On ne peut pas viser deux fois le même joueur en moins de {MALUS_COOLDOWN_HOURS} heures.
          </li>
        </ul>
      </Rule>

      <Rule title="Les familles et leurs bonus permanents">
        <p>
          Posséder les 4 cartes d’une famille — même une seule fois, même si tu les as ensuite
          jouées ou revendues — débloque un bonus qui vaut pour toute la saison.
        </p>
        <ul className="space-y-1.5">
          {(Object.keys(THEMES) as ThemeId[]).map((id) => {
            const theme = THEMES[id];
            return (
              <li key={id} className="flex flex-wrap items-baseline gap-x-2">
                <span
                  className="font-display text-sm font-bold uppercase tracking-wide"
                  style={{ color: theme.color }}
                >
                  <span aria-hidden="true">{theme.glyph}</span> {theme.name}
                </span>
                <span className="text-ink">{theme.setBonusLabel}</span>
              </li>
            );
          })}
        </ul>
      </Rule>

      <Rule title="Les boosters">
        <p>Le tirage est effectué par le serveur, avec une source aléatoire cryptographique.</p>
        <div className="scroll-x">
          <table className="rank-table min-w-[520px]">
            <thead>
              <tr>
                <th>Booster</th>
                <th className="text-right">Prix</th>
                <th className="text-right">Cartes</th>
                <th>Garantie</th>
                <th className="text-right">Chance légendaire</th>
              </tr>
            </thead>
            <tbody>
              {BOOSTERS.map((b) => {
                const total = Object.values(b.weights).reduce((a, x) => a + x, 0);
                return (
                  <tr key={b.id}>
                    <td className="text-ink">
                      <span aria-hidden="true">{b.glyph}</span> {b.name}
                    </td>
                    <td className="num text-right text-ice">❄ {b.price.toLocaleString('fr-FR')}</td>
                    <td className="num text-right text-muted">{b.cardCount}</td>
                    <td className="text-muted">
                      {b.guaranteed ? `1 ${b.guaranteed.toLowerCase()}` : '—'}
                    </td>
                    <td className="num text-right text-gold">
                      {((b.weights.LEGENDAIRE / total) * 100).toFixed(1)} %
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Rule>

      <Rule title="L’hôtel des ventes">
        <ul className="list-inside list-disc space-y-1">
          <li>
            Tu choisis un prix de départ, un achat immédiat facultatif, et une durée
            ({MARKET.durationsHours.join(', ')} heures).
          </li>
          <li>
            Enchérir <strong>bloque immédiatement tes flocons</strong>. Ils te sont rendus dès que
            quelqu’un surenchérit.
          </li>
          <li>
            Chaque mise doit dépasser la précédente d’au moins {MARKET.minIncrementFlat} ❄ ou{' '}
            {Math.round(MARKET.minIncrementRate * 100)} %, la plus grande des deux valeurs.
          </li>
          <li>
            Une mise dans la dernière minute repousse la clôture d’une minute&nbsp;: le sniping ne
            sert à rien.
          </li>
          <li>
            Taxe de {Math.round(MARKET.feeRate * 100)} % prélevée au vendeur, réduite de moitié si
            la famille Solstice est complète.
          </li>
          <li>Une vente ne peut être retirée que si personne n’a encore misé.</li>
          <li>
            Une carte mise en vente est verrouillée&nbsp;: impossible de la jouer avant la fin de la
            vente.
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
