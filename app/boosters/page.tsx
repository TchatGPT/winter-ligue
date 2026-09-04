import { BoosterOpening, type CatalogCard, type ShopBooster } from '@/components/BoosterOpening';
import { CatalogueCartes, type CarteCatalogue } from '@/components/CatalogueCartes';
import { RarityChip } from '@/components/ui';
import { getSession, playerIdOf } from '@/lib/auth/session';
import { getStore } from '@/lib/db/store';
import { CARDS } from '@/lib/domain/catalog';
import { prixSansEvenement, resolvedBoosters } from '@/lib/services/boosters';
import { allCards } from '@/lib/services/collection';
import { statsForCard } from '@/lib/services/market';
import { TitreGlace } from '@/components/TitreGlace';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Boosters' };



/**
 * Boosters : achat, ouverture en 3D, et catalogue complet des 24 cartes.
 *
 * Le catalogue est rangé par rareté : c'est le seul classement d'une carte
 * depuis que les familles ont été retirées, et c'est aussi la seule chose
 * qu'un booster promet.
 */
export default async function BoostersPage() {
  const session = await getSession();
  const playerId = playerIdOf(session);

  const { balance, shopOpen, marketOpen, quotes, catalogueBoosters, pool } = await getStore().read((db) => ({
    balance: playerId ? (db.players.find((p) => p.id === playerId)?.snowflakes ?? null) : null,
    shopOpen: db.config.shopOpen,
    marketOpen: db.config.marketOpen,
    // Prix et taux tels que l'administration les a réglés, pas ceux du
    // catalogue : la page doit annoncer ce que le serveur appliquera.
    catalogueBoosters: resolvedBoosters(db).map((b) => ({
      ...b,
      // Le prix hors évènement, pour le barrer pendant une braderie.
      basePrice: prixSansEvenement(db, b.id) ?? b.price,
    })),
    /*
     * Le pool **entier** : cartes à effet, cartes Joueur et cartes Moment.
     *
     * Un booster tire ses emplacements de collection dans `db.collectibles`,
     * qui vit en base et n'est donc pas dans le catalogue figé. Envoyer le seul
     * catalogue laissait le client sans rien à afficher pour ces cartes-là : la
     * révélation montrait des cadres vides, sans nom ni illustration, pour des
     * cartes qui existaient pourtant bel et bien.
     */
    pool: allCards(db),
    // Cote de chaque carte, pour que le catalogue affiche une valeur de marché.
    quotes: Object.fromEntries(
      CARDS.map((c) => [c.id, statsForCard(db, c.id).lastPrice]),
    ) as Record<string, number | null>,
  }));

  const boosters: ShopBooster[] = catalogueBoosters.map((b) => ({ ...b, finalPrice: b.price }));

  // Le catalogue tel que la grille filtrable l'attend.
  const catalogue: CarteCatalogue[] = CARDS.map((c) => ({
    id: c.id,
    name: c.name,
    description: c.description,
    rarity: c.rarity,
    glyph: c.glyph,
    power: c.power,
    nature: c.nature,
    quote: quotes[c.id],
  }));

  // Envoyé au client pour afficher les cartes tirées sans second aller-retour.
  const catalog: Record<string, CatalogCard> = Object.fromEntries(
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
    <div className="space-y-8">
      {/*
        Le titre reprend sa pleine taille, et les explications descendent.

        Les trois cadres numérotés qui occupaient cette place ont sauté : trois
        boîtes à lire avant d'atteindre les sachets, pour dire ce qui se dit en
        une ligne. Ce qu'elles portaient est maintenant sous le nom du sachet, à
        l'endroit où l'on regarde déjà — et le nom du sachet, lui, a la taille
        d'un titre, puisque c'est le seul mot qui change quand on fait défiler la
        rangée.
      */}
      <header>
        <TitreGlace taille="page" eyebrow="24 cartes · 6 raretés">
          Ouvrir un booster
        </TitreGlace>
      </header>

      <BoosterOpening
        boosters={boosters}
        balance={balance}
        shopOpen={shopOpen}
        marketOpen={marketOpen}
        connected={playerId !== null}
        catalog={catalog}
      />

      {/* ---------------------------- Catalogue ------------------------- */}
      <section className="space-y-7 pt-2">
        <TitreGlace
          taille="bloc"
          lead="Rangé par rareté, parce que c’est tout ce qu’un booster promet : quatre cartes par palier, et une puissance qui monte de palier en palier."
        >
          Le catalogue
        </TitreGlace>

        <CatalogueCartes cartes={catalogue} />
      </section>

      <section className="glass px-4 py-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-faint">
          <span className="font-display text-xs font-bold tracking-wider text-muted uppercase">
            Légende
          </span>
          {(['C', 'PC', 'R', 'SR', 'UR', 'L'] as const).map((r) => (
            <span key={r} className="flex items-center gap-1.5">
              <RarityChip rarity={r} />
              {
                { C: 'Commune', PC: 'Peu commune', R: 'Rare', SR: 'Super rare', UR: 'Ultra rare', L: 'Légendaire' }[
                  r
                ]
              }
            </span>
          ))}
          <span className="flex items-center gap-1.5">
            <span className="text-danger">⚡</span> Puissance
          </span>
          <span className="flex items-center gap-1.5">
            <span className="text-ice">❄</span> Cote de marché
          </span>
        </div>
      </section>
    </div>
  );
}
