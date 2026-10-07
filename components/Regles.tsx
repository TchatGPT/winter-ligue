import Link from 'next/link';
import type { ReactNode } from 'react';
import { Medaille } from '@/components/EmblemePalier';
import { EnTetePage } from '@/components/EnTetePage';
import { NAV_ICONS, type NavIconName } from '@/components/icons';
import { SnowCap } from '@/components/SnowCap';
import { RarityChip } from '@/components/ui';
import { PACKS, RARITY_META } from '@/lib/domain/catalog';
import {
  CADEAU_DU_JOUR,
  COMMU_ACCELERE_TOUS_LES,
  DUEL,
  ECONOMY,
  EVENEMENTS_SUBS,
  IMPACT_PAR_RARETE,
  PACKS_REGLES,
  PALIERS_CHANCE,
  PLACEMENT_POINTS,
  SEASON,
  SUB_MILESTONES,
} from '@/lib/domain/rules';
import type { Rarity } from '@/lib/domain/types';

const RARETES: Rarity[] = ['C', 'R', 'UR', 'L'];

const nombre = (n: number) => n.toLocaleString('fr-FR');

/** Un bloc de règles : sa médaille, son titre, une phrase, puis l'essentiel. */
function Bloc({
  titre,
  phrase,
  icone,
  teinte,
  children,
}: {
  titre: string;
  phrase: string;
  icone: NavIconName;
  teinte: string;
  children: ReactNode;
}) {
  const Icone = NAV_ICONS[icone];
  return (
    <section className="glass rg-bloc">
      <SnowCap radius="var(--r-lg)" seed={`regles-${icone}`} epaisseur={14} />
      <header className="rg-tete">
        <Medaille teinte={teinte} id={`regles-${icone}`} className="rg-medaille">
          <Icone className="medaille-icone" />
        </Medaille>
        <div className="min-w-0">
          <h2 className="rg-titre">{titre}</h2>
          <p className="rg-phrase">{phrase}</p>
        </div>
      </header>
      <div className="rg-corps">{children}</div>
    </section>
  );
}

/** Une ligne « ce qu'on fait → ce que ça rapporte », comme sur un tableau d'affichage. */
function Ligne({ quoi, vaut }: { quoi: ReactNode; vaut: ReactNode }) {
  return (
    <li>
      <span>{quoi}</span>
      <b>{vaut}</b>
    </li>
  );
}

/**
 * Les règles, en six blocs : les points, les boosters, les cartes, les
 * flocons, la chance et les duels. L'essentiel seulement, pour qu'on comprenne
 * en une minute ; le détail des cartes est sur la page des boosters.
 *
 * Tous les nombres sont lus dans `lib/domain/rules` et `catalog` : la page dit
 * exactement ce que le serveur applique.
 *
 * Sur un ordinateur, la page tient dans la fenêtre, pied de page compris
 * (`.rg`) ; ce qui ne tient pas défile dans son bloc. Sur un téléphone, les
 * blocs s'empilent.
 */
export function Regles({ maxGames }: { maxGames: number }) {
  const palier = (id: 'commu' | 'folie') => SUB_MILESTONES.find((m) => m.packId === id)?.every;
  const avalanche = EVENEMENTS_SUBS.find((e) => e.kind === 'FLOCONS_DOUBLES');
  const tempete = EVENEMENTS_SUBS.find((e) => e.kind === 'COMMU_ACCELERE');
  const nomDe = (id: string) => PACKS.find((p) => p.id === id)?.name ?? id;
  // Quatre repères sur la jauge de chance, du départ au plafond.
  const reperes = [0, 10_000, 25_000, ECONOMY.soldeMax]
    .map((des) => PALIERS_CHANCE.find((p) => p.des === des))
    .filter((p): p is (typeof PALIERS_CHANCE)[number] => Boolean(p));
  const chanceMax = PALIERS_CHANCE.at(-1)!.multiplicateur;

  const boosters: { id: string; quand: string; pourToi: boolean }[] = [
    { id: 'perso', quand: `1 sub T3 ou ${PACKS_REGLES.persoTousLes} subs offerts`, pourToi: true },
    { id: 'finisseur', quand: 'ta dernière game', pourToi: true },
    { id: 'commu', quand: `tous les ${palier('commu')} subs`, pourToi: false },
    { id: 'folie', quand: `tous les ${palier('folie')} subs`, pourToi: false },
  ];

  return (
    <div className="rg">
      <EnTetePage
        icone="book"
        eyebrow={SEASON.edition}
        titre="Les règles"
        lead="L’essentiel de la saison en six blocs : comment on marque, ce que contiennent les boosters, et à quoi servent les flocons."
      />

      <div className="rg-grille">
        <Bloc titre="Les points" phrase="Ton score, game après game." icone="trophy" teinte="var(--gold)">
          <ul className="rg-lignes">
            <Ligne quoi="Un kill" vaut="1 pt" />
            <Ligne
              quoi="Top 1 · 2 · 3"
              vaut={`+${PLACEMENT_POINTS['1']} · +${PLACEMENT_POINTS['2']} · +${PLACEMENT_POINTS['3']} pts`}
            />
          </ul>
          <p>
            <b>{maxGames} games</b> comptent par joueur. Les <b>{SEASON.finalistCount} premiers</b> du classement vont
            en finale.
          </p>
          <p className="rg-note">Les games sont saisies par la modération, d’après le stream.</p>
        </Bloc>

        <Bloc
          titre="Les boosters"
          phrase="Une carte dans chacun, ouverts en live par Lriaa ou la modération."
          icone="pack"
          teinte="var(--ice)"
        >
          {[true, false].map((pourToi) => (
            <div key={String(pourToi)} className="rg-boosters" data-pour={pourToi ? 'toi' : 'sort'}>
              <p className="rg-boosters-qui">{pourToi ? 'Pour toi' : 'Pour des joueurs tirés au sort'}</p>
              <ul>
                {boosters
                  .filter((b) => b.pourToi === pourToi)
                  .map((b) => (
                    <li key={b.id}>
                      <b>{nomDe(b.id).replace(/^Booster /, '')}</b>
                      <span>{b.quand}</span>
                    </li>
                  ))}
              </ul>
            </div>
          ))}
          {tempete && (
            <p className="rg-note">
              Tous les {tempete.every} subs, la <b>{tempete.label}</b> : un Booster Commu tous les{' '}
              {COMMU_ACCELERE_TOUS_LES} subs pendant 4 jours. Les subs Prime ne comptent pas.
            </p>
          )}
        </Bloc>

        <Bloc
          titre="Les cartes"
          phrase="Elle tombe sur ta prochaine game, puis disparaît."
          icone="layers"
          teinte="var(--violet)"
        >
          <p>Bonus ou malus, une carte ne bouge jamais plus de :</p>
          <ul className="rg-raretes">
            {RARETES.map((r) => (
              <li key={r}>
                <RarityChip rarity={r} />
                <span className="rg-long">{RARITY_META[r].label}</span>
                <span className="rg-court">{RARITY_META[r].short}</span>
                <b>{IMPACT_PAR_RARETE[r]} pts</b>
              </li>
            ))}
          </ul>
          <p className="rg-note">Un booster ouvert pour toi ne contient que des bonus.</p>
          <Link href="/boosters" className="rg-lien">
            Voir toutes les cartes →
          </Link>
        </Bloc>

        <Bloc
          titre="Les flocons"
          phrase="La monnaie de la ligue. Ils se gagnent en jouant."
          icone="snowflake"
          teinte="var(--aurora)"
        >
          <ul className="rg-lignes">
            <Ligne quoi="Un kill" vaut={`${ECONOMY.perKill} ❄`} />
            <Ligne
              quoi="Top 1 · 2 · 3"
              vaut={`${ECONOMY.perPlacement['1']} · ${ECONOMY.perPlacement['2']} · ${ECONOMY.perPlacement['3']} ❄`}
            />
            <Ligne
              quoi="Cadeau du jour"
              vaut={`${CADEAU_DU_JOUR.parJour} ❄ (${CADEAU_DU_JOUR.septiemeJour} le ${CADEAU_DU_JOUR.cycle}e jour)`}
            />
          </ul>
          <p>
            Et les <b>codes cadeaux</b> donnés en live. Ils servent à <b>miser en duel</b> et à{' '}
            <b>augmenter ta chance</b>. Plafond : <b>{nombre(ECONOMY.soldeMax)} ❄</b>.
          </p>
          {avalanche && (
            <p className="rg-note">
              Tous les {avalanche.every} subs, l’<b>{avalanche.label}</b> double les flocons des games pendant 1 h.
            </p>
          )}
        </Bloc>

        <Bloc
          titre="La chance"
          phrase="Plus tu as de flocons, plus tes boosters sortent rare."
          icone="rocket"
          teinte="var(--gold)"
        >
          <div className="rg-jauge" aria-hidden="true">
            <span />
          </div>
          <ol className="rg-reperes">
            {reperes.map((p) => (
              <li key={p.des}>
                <b>×{p.multiplicateur.toLocaleString('fr-FR')}</b>
                <span>{nombre(p.des)} ❄</span>
              </li>
            ))}
          </ol>
          <p>
            À ×{chanceMax}, les cartes rares sortent <b>{chanceMax} fois plus souvent</b> de ton Booster Perso et de ton
            Booster Finisseur.
          </p>
          <p className="rg-note">Tes flocons ne sont pas dépensés : il suffit de les avoir.</p>
        </Bloc>

        <Bloc
          titre="Les duels"
          phrase="Deux joueurs, la même mise, le gagnant rafle tout."
          icone="swords"
          teinte="var(--danger)"
        >
          <ul className="rg-lignes">
            <Ligne quoi="Mise" vaut={`${nombre(DUEL.miseMin)} à ${nombre(DUEL.miseMax)} ❄`} />
            <Ligne quoi="Chances" vaut="1 sur 2" />
            <Ligne quoi="Le gagnant" vaut="prend les deux mises" />
          </ul>
          <p className="rg-note">Tant que personne n’a relevé ton duel, tu peux l’annuler : ta mise t’est rendue.</p>
          <Link href="/duels" className="rg-lien">
            Lancer un duel →
          </Link>
        </Bloc>
      </div>
    </div>
  );
}
