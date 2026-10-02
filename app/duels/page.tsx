import { Affrontements } from '@/components/Affrontements';
import { EnTetePage } from '@/components/EnTetePage';
import { flakes } from '@/components/ui';
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
 * En tête, le titre et les règles sur une ligne : quatre mots qu'on lit d'un
 * regard. Dessous, le salon (voir `Affrontements`) : à gauche ce qui sert à
 * jouer — les défis à relever, puis le sien à lancer —, à droite les
 * résultats. Sur un ordinateur, la page tient dans l'écran.
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
        <ul className="duels-regles" aria-label="Les règles du duel">
          <li>
            <b>Même mise</b>
            <span>
              de {flakes(DUEL.miseMin)} à {flakes(DUEL.miseMax)} ❄, des deux côtés
            </span>
          </li>
          <li>
            <b>Une manche</b>
            <span>chacun pousse sa boule de neige</span>
          </li>
          <li>
            <b>Le premier qui tombe</b>
            <span>a perdu — une chance sur deux</span>
          </li>
          <li>
            <b>Tout ou rien</b>
            <span>le gagnant rafle les deux mises</span>
          </li>
        </ul>
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
