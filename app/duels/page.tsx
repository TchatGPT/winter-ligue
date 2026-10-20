import { Affrontements } from '@/components/Affrontements';
import { EnTetePage } from '@/components/EnTetePage';
import { ReglesDuel } from '@/components/ReglesDuel';
import { exigeSession } from '@/lib/auth/acces';
import { getSession, playerIdOf } from '@/lib/auth/session';
import { getStore } from '@/lib/db/store';
import { MANCHES_MAX, MANCHES_MIN } from '@/lib/domain/bataille';
import { DUEL, ECONOMY } from '@/lib/domain/rules';
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
 * En tête, le titre et le déroulé d'un duel en quatre étapes (`ReglesDuel`).
 * Dessous, le salon (voir `Affrontements`) : lancer son duel, rejoindre ceux
 * des autres, les résultats. Sur un ordinateur, la page tient dans l'écran,
 * pied compris, en trois colonnes.
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

  return (
    <div className="duels-page">
      <EnTetePage icone="swords" eyebrow="Duel de flocons" titre="Les duels">
        <ReglesDuel />
      </EnTetePage>

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
