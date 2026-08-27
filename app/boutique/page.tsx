import { BoosterShop, type ShopBooster } from '@/components/BoosterShop';
import { getSession } from '@/lib/auth/session';
import { getStore } from '@/lib/db/store';
import { BOOSTERS, CARDS } from '@/lib/domain/catalog';
import { discountedPrice } from '@/lib/domain/economy';
import { ECONOMY } from '@/lib/domain/rules';
import { bonusesFor } from '@/lib/services/league';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Boutique de boosters' };

/**
 * Boutique.
 *
 * Le prix affiché est déjà celui que le serveur appliquera : la remise de
 * collection est calculée ici, à partir des familles réellement complétées.
 * Le composant client n'a donc aucun calcul de prix à faire — et aucun moyen
 * d'en imposer un.
 */
export default async function BoutiquePage() {
  const session = await getSession();
  const playerId = session?.role === 'joueur' ? session.sub : null;

  const { balance, discount, shopOpen } = await getStore().read((db) => ({
    balance: playerId ? (db.players.find((p) => p.id === playerId)?.snowflakes ?? null) : null,
    discount: playerId ? bonusesFor(db, playerId).shopDiscount : 0,
    shopOpen: db.config.shopOpen,
  }));

  const boosters: ShopBooster[] = BOOSTERS.map((b) => ({
    ...b,
    finalPrice: discountedPrice(b.price, discount),
  }));

  // Envoyé au client pour afficher les cartes obtenues sans second aller-retour.
  const catalog = Object.fromEntries(
    CARDS.map((c) => [
      c.id,
      {
        name: c.name,
        rarity: c.rarity,
        theme: c.theme,
        glyph: c.glyph,
        description: c.description,
        nature: c.nature,
      },
    ]),
  );

  return (
    <div className="space-y-6">
      <header>
        <p className="eyebrow">Économie de saison</p>
        <h1 className="section-title">
          Boutique de <em>Boosters</em>
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-muted">
          Les flocons se gagnent en jouant&nbsp;: {ECONOMY.perKill} ❄ par kill,{' '}
          {ECONOMY.perPlacement['1']} ❄ pour un Top&nbsp;1, {ECONOMY.perPlacement['2']} ❄ pour un
          Top&nbsp;2, {ECONOMY.perPlacement['3']} ❄ pour un Top&nbsp;3, et{' '}
          {ECONOMY.participation} ❄ pour chaque game enregistrée. Ils s’échangent ici contre des
          boosters, ou à l’hôtel des ventes contre les cartes des autres joueurs.
        </p>
      </header>

      <BoosterShop
        boosters={boosters}
        balance={balance}
        discount={discount}
        shopOpen={shopOpen}
        connected={playerId !== null}
        catalog={catalog}
      />
    </div>
  );
}
