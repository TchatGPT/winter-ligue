import { Affrontements } from '@/components/Affrontements';
import { EnTetePage } from '@/components/EnTetePage';
import { flakes } from '@/components/ui';
import { exigeSession } from '@/lib/auth/acces';
import { getSession, playerIdOf } from '@/lib/auth/session';
import { getStore } from '@/lib/db/store';
import { MANCHES_MAX, MANCHES_MIN } from '@/lib/domain/bataille';
import { CHANCE, DUEL, ECONOMY, libelleMultiplicateur, chanceDe } from '@/lib/domain/rules';
import { tableauBatailles, topSemaine } from '@/lib/services/batailles';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Duels' };

/**
 * Les duels de flocons.
 *
 * Deux camps misent la même somme ; chacun pousse sa boule de neige, et le
 * premier qui tombe a perdu. Le gagnant rafle les deux mises, le perdant perd
 * toute la sienne. Le tirage, la décision et le versement se font côté
 * serveur dans une seule transaction — la page ne fait que rejouer un
 * résultat déjà acquis.
 *
 * De haut en bas : les règles, en une bande qu'on lit d'un regard ; puis le
 * salon — les duels à rejoindre, le ring et les résultats, côte à côte sur un
 * grand écran (voir Affrontements).
 */
export default async function DuelsPage() {
  await exigeSession();
  const session = await getSession();
  const playerId = playerIdOf(session);

  const { batailles, top, balance, pseudo } = await getStore().read((db) => {
    const moi = playerId ? db.players.find((p) => p.id === playerId) : undefined;
    return {
      batailles: tableauBatailles(db),
      top: topSemaine(db),
      balance: moi?.snowflakes ?? null,
      pseudo: moi?.pseudo ?? null,
    };
  });

  const chance = balance !== null ? chanceDe(balance) : null;

  return (
    <div className="space-y-5">
      <EnTetePage
        icone="swords"
        eyebrow="Duel de flocons"
        titre="Les duels"
        lead="Deux pères Noël, deux boules de neige. Le premier qui tombe a perdu, et le gagnant rafle tout."
      />

      {/* ---- Les règles : une bande, en tête ---- */}
      <section className="glass regles-duel" aria-label="Les règles du duel">
        <ol className="regles-grille">
          <li className="duel-etape">
            <i>1</i>
            <b>Même mise</b>
            <p>
              De {flakes(DUEL.miseMin)} à {flakes(DUEL.miseMax)} ❄, et ton adversaire mise autant.
            </p>
          </li>
          <li className="duel-etape">
            <i>2</i>
            <b>Une seule manche</b>
            <p>Chacun pousse sa boule de neige, qui grossit en roulant.</p>
          </li>
          <li className="duel-etape">
            <i>3</i>
            <b>Le premier qui tombe</b>
            <p>Une chute, une boule qui éclate, une boule de neige en pleine face : il a perdu. Une chance sur deux pour chacun.</p>
          </li>
          <li className="duel-etape">
            <i>4</i>
            <b>Tout ou rien</b>
            <p>
              Le gagnant rafle <strong className="text-aurora">les deux mises</strong>. Le perdant perd{' '}
              <strong className="text-ink">100 % de la sienne</strong>.
            </p>
          </li>
          <li className="regles-chance">
            <div className="flex items-baseline justify-between gap-2">
              <b className="font-display text-[15px] font-black tracking-wide text-ink uppercase">
                Garder ses flocons
              </b>
              {chance !== null && (
                <span className="font-display text-xl leading-none font-black text-ice tabular-nums">
                  {libelleMultiplicateur(chance)}
                </span>
              )}
            </div>
            <div className="jauge-chance mt-2" aria-hidden="true">
              <span style={{ width: `${(chance ?? 0) * 100}%` }} />
            </div>
            <p className="mt-2 text-[13px] leading-snug text-ink-2">
              Ton solde pousse la chance de tes boosters, de {libelleMultiplicateur(0)} à {libelleMultiplicateur(CHANCE.max)}{' '}
              pour {flakes(ECONOMY.soldeMax)} ❄. Miser, c’est la risquer.
            </p>
          </li>
        </ol>
      </section>

      <Affrontements
        initial={{
          batailles,
          top,
          balance,
          bornes: {
            manches: { min: MANCHES_MIN, max: MANCHES_MAX },
            mise: { min: DUEL.miseMin, max: DUEL.miseMax },
          },
          moiId: playerId,
        }}
        moiPseudo={pseudo}
        soldeMax={ECONOMY.soldeMax}
      />
    </div>
  );
}
