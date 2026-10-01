import { PackOpening, type JoueurOuverture, type PackVitrine } from '@/components/PackOpening';
import { getSession } from '@/lib/auth/session';
import { exigeSession } from '@/lib/auth/acces';
import { getStore } from '@/lib/db/store';
import { CARDS, cartesDuPack, impactMax, momentDe } from '@/lib/domain/catalog';
import type { CarteSaison } from '@/components/CartesParRarete';
import { chanceDe } from '@/lib/domain/rules';
import { fileDesPacks, resolvedPacks } from '@/lib/services/packs';
import { EnTetePage } from '@/components/EnTetePage';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Boosters' };

/**
 * Les boosters : la même page qu'avant, à une différence près — personne
 * n'achète. Le bouton d'ouverture et le choix du joueur n'apparaissent
 * qu'à la modération ; la route d'API revérifie le rôle de son côté.
 */
export default async function PacksPage(){
  await exigeSession();
  const session = await getSession();
  const moderateur = session?.role === 'admin';
  // Le choix du joueur et le bouton d'ouverture : la modération seule. On
  // n'ouvre que ce qui est dû, et la route le revérifie.
  const aLaMain = session?.role === 'admin';

  const { packs, file, joueurs, totalSubs } = await getStore().read((db) => ({
    // Les taux réglés par l'administration, pas ceux du catalogue : la page
    // doit annoncer ce que le serveur appliquera.
    packs: resolvedPacks(db).map(
      (p): PackVitrine => ({
        ...p,
        cartes: cartesDuPack(p.id).map((c) => ({
          cardId: c.id,
          name: c.name,
          rarity: c.rarity,
          glyph: c.glyph,
          description: c.description,
          power: c.power,
          nature: c.nature,
        })),
      }),
    ),
    file: fileDesPacks(db),
    // Pour dire à la modération quand tombe le prochain Commu ou Folie.
    totalSubs: db.config.totalSubs,
    // La liste des joueurs ne quitte le serveur que pour qui peut ouvrir à la main.
    joueurs: aLaMain
      ? db.players
          .filter((p) => p.active)
          .map(
            (p): JoueurOuverture => ({
              id: p.id,
              pseudo: p.pseudo,
              snowflakes: p.snowflakes,
              chance: chanceDe(p.snowflakes),
            }),
          )
          .sort((a, b) => a.pseudo.localeCompare(b.pseudo, 'fr'))
      : [],
  }));

  // Toutes les cartes de la saison, pour la planche par rareté sous les boosters.
  const saison = CARDS.map(
    (c): CarteSaison => ({
      cardId: c.id,
      name: c.name,
      action: c.subtitle,
      rarity: c.rarity,
      glyph: c.glyph,
      description: c.description,
      power: c.power,
      nature: c.nature,
      moment: momentDe(c.effect),
      impact: impactMax(c.effect),
    }),
  );

  return (
    <div className="space-y-6">
      <EnTetePage
        icone="rocket"
        eyebrow="Cartes de la saison"
        titre="Les boosters"
        lead="Une carte par booster, ouverte à l’antenne. Les actions des roues de la Summer, à la mesure de l’hiver."
      />

      <PackOpening
        packs={packs}
        saison={saison}
        file={file}
        joueurs={joueurs}
        moderateur={moderateur}
        aLaMain={aLaMain}
        totalSubs={totalSubs}
      />
    </div>
  );
}
