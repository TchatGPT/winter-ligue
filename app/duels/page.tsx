import { Affrontements } from '@/components/Affrontements';
import { SnowCap } from '@/components/SnowCap';
import { TitreGlace } from '@/components/TitreGlace';
import { flakes } from '@/components/ui';
import { exigeSession } from '@/lib/auth/acces';
import { getSession, playerIdOf } from '@/lib/auth/session';
import { getStore } from '@/lib/db/store';
import { MANCHES_MAX, MANCHES_MIN } from '@/lib/domain/bataille';
import { rewardForGame } from '@/lib/domain/economy';
import { DUEL, ECONOMY, libelleMultiplicateur, chanceDe } from '@/lib/domain/rules';
import { tableauBatailles, topSemaine } from '@/lib/services/batailles';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Duels' };

/**
 * Les duels de flocons.
 *
 * Deux camps misent la même somme et s'affrontent en une bataille de boules
 * de neige, manche par manche ; le gagnant rafle toute la mise. Le tirage,
 * la décision et le versement se font côté serveur dans une seule
 * transaction — la page ne fait que rejouer un résultat déjà acquis.
 *
 * Le salon vient en premier : c'est lui qu'on vient chercher. Les règles et
 * l'intérêt des flocons suivent, en tuiles, pour qui veut comprendre avant de
 * miser.
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

  const exemple = rewardForGame(10, 1).total;
  const chance = balance !== null ? chanceDe(balance) : null;

  return (
    <div className="space-y-6">
      <header>
        <TitreGlace taille="page" eyebrow="Duel de flocons">
          Les duels
        </TitreGlace>
        <p className="mt-2 max-w-3xl text-[15px] text-ink-2">
          Une bataille de boules de neige contre un joueur ou contre le bot. Même mise des deux côtés, et le
          gagnant rafle tout.
        </p>
      </header>

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

      {/* ---- Comment ça marche, et pourquoi garder ses flocons ---- */}
      <div className="grid gap-5 xl:grid-cols-2">
        <section className="glass relative overflow-hidden p-5 sm:p-6">
          <SnowCap radius="var(--r-lg)" seed="duels-regle" epaisseur={14} />
          <p className="eyebrow relative">La règle</p>
          <h2 className="relative mt-1 font-display text-2xl font-black tracking-wide text-ink uppercase">
            Comment se joue un duel
          </h2>
          <ol className="mt-4 grid gap-2.5 sm:grid-cols-2">
            <li className="duel-etape">
              <i>1</i>
              <b>La mise</b>
              <p>
                De {flakes(DUEL.miseMin)} à {flakes(DUEL.miseMax)} ❄. Ton adversaire mise exactement autant.
              </p>
            </li>
            <li className="duel-etape">
              <i>2</i>
              <b>Le format</b>
              <p>Au meilleur de 1, 3 ou 5 manches : le premier à la majorité l’emporte.</p>
            </li>
            <li className="duel-etape">
              <i>3</i>
              <b>Les boules de neige</b>
              <p>
                À chaque manche, chacun lance une boule d’une puissance de 1 à 100, tirée par le serveur. La plus
                forte gagne ; une égalité se rejoue.
              </p>
            </li>
            <li className="duel-etape">
              <i>4</i>
              <b>Le pot</b>
              <p>
                Le vainqueur rafle <strong className="text-aurora">les deux mises</strong>. Contre le bot, s’il
                gagne, ta mise disparaît.
              </p>
            </li>
          </ol>
          <p className="mt-4 text-[13px] leading-relaxed text-muted">
            Une chance sur deux pour chacun, bot compris : ni ton solde ni ton rôle n’y changent rien.
          </p>
        </section>

        <section className="glass relative overflow-hidden p-5 sm:p-6">
          <SnowCap radius="var(--r-lg)" seed="duels-flocons" epaisseur={14} />
          <p className="eyebrow relative">La monnaie</p>
          <h2 className="relative mt-1 font-display text-2xl font-black tracking-wide text-ink uppercase">
            Pourquoi avoir plus de flocons
          </h2>

          {/* La chance aux boosters, de ×1 à ×2, et où en est le joueur. */}
          <div className="mt-4 rounded-[var(--r-md)] bg-black/15 p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <b className="font-display text-[15px] font-black tracking-wide text-ink uppercase">
                Ta chance aux boosters
              </b>
              {chance !== null && (
                <span className="font-display text-2xl leading-none font-black text-ice tabular-nums">
                  {libelleMultiplicateur(chance)}
                </span>
              )}
            </div>
            <div className="jauge-chance mt-3" aria-hidden="true">
              <span style={{ width: `${(chance ?? 0) * 100}%` }} />
            </div>
            <div className="mt-1.5 flex justify-between text-[12px] text-muted tabular-nums">
              <span>{libelleMultiplicateur(0)} à 0 ❄</span>
              <span>
                {libelleMultiplicateur(1)} à {flakes(ECONOMY.soldeMax)} ❄
              </span>
            </div>
            <p className="mt-2 text-[14px] leading-relaxed text-ink-2">
              Quand un booster est ouvert pour toi, ton solde pousse les raretés vers le haut. Les flocons ne sont
              pas dépensés : ils comptent tant que tu les gardes.
            </p>
          </div>

          <ul className="mt-2.5 grid gap-2.5 sm:grid-cols-2">
            <li className="duel-etape">
              <i>❄</i>
              <b>Miser plus gros</b>
              <p>Plus ton solde est haut, plus les duels que tu peux lancer ou relever sont gros.</p>
            </li>
            <li className="duel-etape">
              <i>⚖</i>
              <b>Le choix</b>
              <p>Garder ses flocons pour de meilleures cartes, ou les risquer pour les doubler.</p>
            </li>
          </ul>
          <p className="mt-4 text-[13px] leading-relaxed text-muted">
            Ils se gagnent en jouant — une game à 10 kills et Top 1 rapporte {flakes(exemple)} ❄ — et ne
            s’achètent pas. Le solde est plafonné à {flakes(ECONOMY.soldeMax)} ❄.
          </p>
        </section>
      </div>
    </div>
  );
}
