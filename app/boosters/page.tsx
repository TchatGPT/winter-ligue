import { PackOpening, type JoueurOuverture, type PackVitrine } from '@/components/PackOpening';
import { getSession } from '@/lib/auth/session';
import { exigeSession } from '@/lib/auth/acces';
import { getStore } from '@/lib/db/store';
import { CARDS, cartesDuPack, impactMax, momentDe } from '@/lib/domain/catalog';
import type { CarteSaison } from '@/components/CartesParRarete';
import { chanceDe } from '@/lib/domain/rules';
import { fileDesPacks, joueursEnLice, resolvedPacks } from '@/lib/services/packs';

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
    // Ceux qui sont en lice : la streameuse ne joue pas, rien ne s'ouvre pour elle.
    joueurs: aLaMain
      ? joueursEnLice(db)
          .map(
            (p): JoueurOuverture => ({
              id: p.id,
              pseudo: p.pseudo,
              avatarUrl: p.avatarUrl ?? null,
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
      {/* Pas d'en-tête : la page s'ouvre sur « Comment ça marche », puis la
          scène, qui porte le nom du booster choisi. Le titre de la page reste
          pour les lecteurs d'écran. */}
      <h1 className="sr-only">Les boosters</h1>

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
