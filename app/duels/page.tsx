import { Affrontements } from '@/components/Affrontements';
import type { CatalogueCarte } from '@/components/BatailleArene';
import { getSession, playerIdOf } from '@/lib/auth/session';
import { exigeSession } from '@/lib/auth/acces';
import { getStore } from '@/lib/db/store';
import { MANCHES_MAX, MANCHES_MIN } from '@/lib/domain/bataille';
import { CARDS } from '@/lib/domain/catalog';
import { DUEL } from '@/lib/domain/rules';
import { tableauBatailles, topSemaine } from '@/lib/services/batailles';
import { TitreGlace } from '@/components/TitreGlace';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Duels' };

/**
 * Les duels.
 *
 * Deux camps misent la même somme, tirent le même nombre de cartes, et celui
 * dont les cartes totalisent la plus haute somme de raretés remporte le pot.
 * Le tirage, la comparaison et le versement se font côté serveur dans une
 * seule transaction — la page ne fait que mettre en scène un résultat déjà
 * acquis.
 */
export default async function DuelsPage(){
  await exigeSession();
  const session = await getSession();
  const playerId = playerIdOf(session);

  const { batailles, top, balance } = await getStore().read((db) => ({
    batailles: tableauBatailles(db),
    top: topSemaine(db),
    balance: playerId ? (db.players.find((p) => p.id === playerId)?.snowflakes ?? null) : null,
  }));

  const catalog: Record<string, CatalogueCarte> = Object.fromEntries(
    CARDS.map((c) => [
      c.id,
      {
        name: c.name,
        subtitle: c.subtitle,
        rarity: c.rarity,
        glyph: c.glyph,
        description: c.description,
        nature: c.nature,
        power: c.power,
      },
    ]),
  );

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <TitreGlace taille="page">Les duels</TitreGlace>
        <p className="text-[15px] text-muted">
          Mise tes flocons contre un autre joueur, et rafle le pot.
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
        catalog={catalog}
        poids={DUEL.weights}
      />
    </div>
  );
}
