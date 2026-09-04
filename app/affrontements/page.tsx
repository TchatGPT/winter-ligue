import { Affrontements } from '@/components/Affrontements';
import type { CatalogueCarte } from '@/components/BatailleArene';

import { getSession, playerIdOf } from '@/lib/auth/session';
import { getStore } from '@/lib/db/store';
import { MANCHES_MAX, MANCHES_MIN } from '@/lib/domain/bataille';
import { tableauBatailles, topSemaine } from '@/lib/services/batailles';
import { resolvedBoosters } from '@/lib/services/boosters';
import { allCards } from '@/lib/services/collection';
import { TitreGlace } from '@/components/TitreGlace';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Affrontements' };

/**
 * Les affrontements de boosters.
 *
 * Deux camps misent le même sachet le même nombre de fois, ouvrent en même
 * temps, et celui dont les cartes totalisent la plus haute somme de raretés
 * remporte tout. Le tirage, la comparaison et l'attribution se font côté serveur
 * dans une seule transaction — la page ne fait que mettre en scène un résultat
 * déjà acquis.
 */
export default async function AffrontementsPage() {
  const session = await getSession();
  const playerId = playerIdOf(session);

  const { batailles, top, boosters, shopOpen, balance, pool } = await getStore().read((db) => ({
    batailles: tableauBatailles(db),
    top: topSemaine(db),
    // Les prix réglés par l'administration, pas ceux du catalogue : la mise
    // affichée doit être celle que le serveur débitera.
    boosters: resolvedBoosters(db),
    shopOpen: db.config.shopOpen,
    balance: playerId ? (db.players.find((p) => p.id === playerId)?.snowflakes ?? null) : null,
    /*
     * Le pool entier : cartes à effet, cartes Joueur et cartes Moment. Les
     * rouleaux y puisent leurs leurres, et la révélation y lit les noms et les
     * illustrations — sans lui, les cartes de collection tirées apparaîtraient
     * en cadres vides.
     */
    pool: allCards(db),
  }));

  const catalog: Record<string, CatalogueCarte> = Object.fromEntries(
    pool.map((c) => [
      c.id,
      {
        name: c.name,
        subtitle: c.subtitle,
        rarity: c.rarity,
        glyph: c.glyph,
        description: c.description,
        // Une carte de collection n'a ni nature ni puissance : elle ne se joue
        // pas. Mettre zéro afficherait une puissance qu'elle n'a pas.
        nature: c.nature ?? undefined,
        power: c.power ?? undefined,
      },
    ]),
  );

  return (
    <div className="space-y-5">
      {/*
        Un entête d'une ligne, et non un titre de couverture.

        Il occupait un tiers de l'écran : un titre géant, un surtitre, et quatre
        lignes de règles à lire avant de voir le premier affrontement. Or on ne
        vient pas ici lire les règles — on vient voir ce qui se joue. Le titre et
        sa phrase tiennent maintenant sur une ligne, comme sur la référence, et
        le premier affrontement est visible sans faire défiler.

        Les règles n'ont pas disparu : elles sont dans le panneau de création,
        là où elles servent, au moment où l'on mise.
      */}
      <header className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <TitreGlace taille="page">Les affrontements</TitreGlace>
        <p className="text-[15px] text-muted">
          Joue contre les autres joueurs, et rafle l’intégralité de leurs cartes.
        </p>
      </header>

      <Affrontements
        initial={{
          batailles,
          top,
          boosters,
          shopOpen,
          balance,
          bornes: { min: MANCHES_MIN, max: MANCHES_MAX },
          moiId: playerId,
        }}
        catalog={catalog}
      />
    </div>
  );
}
