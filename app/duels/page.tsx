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
 * La page dit aussi, en tête, à quoi servent les flocons : sans ça, on ne
 * comprend pas pourquoi on les garderait plutôt que de les miser.
 */
export default async function DuelsPage() {
  await exigeSession();
  const session = await getSession();
  const playerId = playerIdOf(session);

  const { batailles, top, balance } = await getStore().read((db) => ({
    batailles: tableauBatailles(db),
    top: topSemaine(db),
    balance: playerId ? (db.players.find((p) => p.id === playerId)?.snowflakes ?? null) : null,
  }));

  const exemple = rewardForGame(10, 1).total;
  const moitie = Math.round(ECONOMY.soldeMax / 2);

  return (
    <div className="space-y-5">
      <header>
        <TitreGlace taille="page" eyebrow="Duel de flocons">
          Les duels
        </TitreGlace>
        <p className="mt-2 max-w-3xl text-[15px] text-ink-2">
          Mise tes flocons contre un autre joueur — ou contre le bot — et rafle toute la mise.
        </p>
      </header>

      {/* ---- Comment ça marche, et pourquoi garder ses flocons ---- */}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="glass relative overflow-hidden p-5 sm:p-6">
          <SnowCap radius="var(--r-lg)" seed="duels-regle" epaisseur={14} />
          <h2 className="font-display text-xl font-black tracking-wide text-ink uppercase">Comment se joue un duel</h2>
          <ol className="mt-3 space-y-2 text-[15px] leading-relaxed text-ink-2">
            <li>
              <strong className="text-ink">1. La mise.</strong> Tu choisis combien tu mises, de{' '}
              {flakes(DUEL.miseMin)} à {flakes(DUEL.miseMax)} ❄. Ton adversaire mise exactement autant.
            </li>
            <li>
              <strong className="text-ink">2. Le format.</strong> Au meilleur de 1, 3 ou 5 manches.
            </li>
            <li>
              <strong className="text-ink">3. Les boules de neige.</strong> À chaque manche, chacun lance une
              boule d’une puissance de 1 à 100, tirée par le serveur. La plus forte gagne la manche ; une
              égalité se rejoue.
            </li>
            <li>
              <strong className="text-ink">4. Le pot.</strong> Le premier à la majorité des manches rafle{' '}
              <strong className="text-aurora">toute la mise</strong> : les deux mises réunies.
            </li>
          </ol>
          <p className="mt-3 text-[13px] text-faint">
            Une chance sur deux pour chacun, bot compris : ni ton solde ni ton rôle n’y changent rien. Pas
            d’adversaire ? Joue contre le bot — s’il gagne, ta mise disparaît ; s’il perd, tu doubles.
          </p>
        </section>

        <section className="glass relative overflow-hidden p-5 sm:p-6">
          <SnowCap radius="var(--r-lg)" seed="duels-flocons" epaisseur={14} />
          <h2 className="font-display text-xl font-black tracking-wide text-ink uppercase">
            Pourquoi avoir plus de flocons
          </h2>
          <ul className="mt-3 space-y-2 text-[15px] leading-relaxed text-ink-2">
            <li>
              <strong className="text-ink">De la chance aux boosters.</strong> Quand un booster est ouvert pour
              toi, ton solde pousse les raretés vers le haut : de {libelleMultiplicateur(0)} à 0 ❄, jusqu’à{' '}
              {libelleMultiplicateur(1)} à {flakes(ECONOMY.soldeMax)} ❄ ({libelleMultiplicateur(chanceDe(moitie))} à{' '}
              {flakes(moitie)} ❄). Les flocons ne sont pas dépensés : ils comptent tant que tu les gardes.
            </li>
            <li>
              <strong className="text-ink">De quoi miser plus gros.</strong> Plus ton solde est haut, plus les
              duels que tu peux lancer ou rejoindre sont gros.
            </li>
            <li>
              <strong className="text-ink">Le choix.</strong> Garder ses flocons pour tirer de meilleures
              cartes, ou les risquer pour les doubler : c’est tout le jeu de la monnaie.
            </li>
          </ul>
          <p className="mt-3 text-[13px] text-faint">
            Ils se gagnent en jouant — une game à 10 kills et Top 1 rapporte {flakes(exemple)} ❄ —, et ne
            s’achètent pas. Le solde est plafonné à {flakes(ECONOMY.soldeMax)} ❄.
            {balance !== null && (
              <>
                {' '}
                Ton solde : <strong className="text-ice">{flakes(balance)} ❄</strong>, soit{' '}
                <strong className="text-ice">{libelleMultiplicateur(chanceDe(balance))}</strong> aux boosters.
              </>
            )}
          </p>
        </section>
      </div>

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
        soldeMax={ECONOMY.soldeMax}
      />
    </div>
  );
}
