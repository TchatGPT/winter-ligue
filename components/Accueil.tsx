import { CalendrierSaisons, type SaisonDuCalendrier } from '@/components/CalendrierSaisons';
import { type EtapeDuPaquet, PaquetEtapes } from '@/components/PaquetEtapes';
import { type BoosterEnVitrine, VitrineBoosters } from '@/components/VitrineBoosters';
import { IconJauge, IconPack, IconSnowflake, IconSwords, IconTrophy, IconTwitch } from '@/components/icons';
import { GEMME_DU_PACK, PACKS, packArt } from '@/lib/domain/catalog';
import { num } from '@/lib/format';
import {
  CADEAU_DU_JOUR,
  CHANCE,
  DUEL,
  ECONOMY,
  PACKS_REGLES,
  PLACEMENT_POINTS,
  SAISONS,
  SUB_MILESTONES,
  saisonDuMoment,
} from '@/lib/domain/rules';

/**
 * L'accueil, quand on n'est pas connecté.
 *
 * Rien de la ligue n'est visible sans compte : ni classement, ni joueurs, ni
 * duels en cours. La page dit ce qu'est la ligue, et comment y entrer — sur un
 * ordinateur, **en un seul écran, sans défiler** (13/11/2026) :
 *
 *  - au centre, le nom, une phrase, l'entrée par Twitch, puis le calendrier
 *    (`CalendrierSaisons`) : le compte à rebours, et les deux saisons de
 *    l'hiver — la Mini Ligue pour se chauffer, la Saison 2, la vraie, qui
 *    repart de zéro le 4 janvier ;
 *  - autour du titre, les quatre boosters (`VitrineBoosters`), deux de chaque
 *    côté, chacun avec son nom et ce qui le fait tomber ;
 *  - en bas, la ligue en cinq étapes : un paquet de blocs de glace
 *    (`PaquetEtapes`) qu'on fait tourner, l'essentiel seulement.
 *
 * Sur un téléphone ou une tablette debout, tout s'empile et la page défile.
 *
 * Toutes les valeurs viennent de `lib/domain/rules` et du catalogue : la page
 * ne peut pas dire autre chose que ce que le serveur applique.
 */

/** « du 22 novembre au 4 janvier » → « 22 novembre → 4 janvier ». */
function fleche(periode: string): string {
  const m = /^du (.+?) (?:au|à) (.+)$/.exec(periode);
  return m ? `${m[1]} → ${m[2]}` : periode;
}

export function Accueil({ twitchEnabled, devLogin }: { twitchEnabled: boolean; devLogin: boolean }) {
  // La saison du calendrier : la Mini Ligue jusqu'au 4 janvier, puis la saison 2.
  const saison = saisonDuMoment();
  const nomCourt = (s: (typeof SAISONS)[number]) => s.nom.split(' · ').at(-1) ?? s.nom;

  const saisons: SaisonDuCalendrier[] = SAISONS.map((s) => ({
    numero: s.numero,
    nom: nomCourt(s),
    role: s.numero === 1 ? 'l’échauffement' : 'la vraie saison',
    dates: fleche(s.periode),
    detail:
      s.finalistes > 0
        ? `${s.games} games · finale · tout repart de zéro`
        : `${s.games} games · pas de finale`,
    debut: s.debut,
    fin: s.fin,
  }));

  // Twitch branché, on part chez lui ; sinon la page de connexion dit que la
  // connexion ouvre bientôt.
  const entree = twitchEnabled ? '/api/auth/twitch?returnTo=/' : '/connexion';
  const rejoindre = (
    <a href={entree} className="btn btn-twitch btn-lg no-underline">
      <IconTwitch className="h-5 w-5" />
      Rejoindre avec Twitch
    </a>
  );

  // Ce qui fait tomber chaque booster, en quelques mots, sous sa planche.
  const palier = (id: string) => SUB_MILESTONES.find((m) => m.packId === id)?.every ?? 0;
  const QUAND: Record<string, string> = {
    perso: `1 sub T3 ou ${PACKS_REGLES.persoTousLes} subs offerts`,
    commu: `tous les ${palier('commu')} subs`,
    folie: `tous les ${palier('folie')} subs`,
    finisseur: `à ta ${saison.finisseurA}ᵉ game`,
  };
  const boosters: BoosterEnVitrine[] = PACKS.map((p) => ({
    id: p.id,
    nom: p.name,
    court: p.name.replace(/^Booster\s+/, ''),
    quand: QUAND[p.id] ?? p.tagline,
    gradient: p.gradient,
    art: packArt(p.id),
    rarete: GEMME_DU_PACK[p.id],
  }));

  const etapes: EtapeDuPaquet[] = [
    {
      cle: 'classement',
      theme: 'Le classement',
      icone: <IconTrophy />,
      titre: 'Marque des points',
      texte: (
        <>
          <b>1 point</b> par kill, <b>+{PLACEMENT_POINTS['1']}</b> le Top 1, <b>+{PLACEMENT_POINTS['2']}</b> le Top
          2, <b>+{PLACEMENT_POINTS['3']}</b> le Top 3. Tes {saison.games} games font ton total.
        </>
      ),
    },
    {
      cle: 'flocons',
      theme: 'Les flocons',
      icone: <IconSnowflake />,
      titre: 'Gagne des flocons',
      texte: (
        <>
          <b>+{ECONOMY.perKill} ❄</b> par kill, <b>+{ECONOMY.perPlacement['1']} ❄</b> le Top 1,{' '}
          <b>+{CADEAU_DU_JOUR.parJour} ❄</b> chaque jour. Ils ne s’achètent pas : ils se gagnent.
        </>
      ),
    },
    {
      cle: 'boosters',
      theme: 'Les boosters',
      icone: <IconPack />,
      titre: 'Ouvre des boosters',
      texte: (
        <>
          Les subs du live en font tomber, ouverts <b>en direct</b>. Chacun donne <b>une carte</b> qui change une
          game, en bonus ou en malus.
        </>
      ),
    },
    {
      cle: 'chance',
      theme: 'La chance',
      icone: <IconJauge />,
      titre: 'Vise les cartes rares',
      texte: (
        <>
          Garde tes flocons : plus ta réserve est grosse, plus tu tires rare. Jusqu’à <b>×{1 + CHANCE.max} de chance</b>.
        </>
      ),
    },
    {
      cle: 'duels',
      theme: 'Les duels',
      icone: <IconSwords />,
      titre: 'Défie les autres',
      texte: (
        <>
          Mise de <b>{num(DUEL.miseMin)} à {num(DUEL.miseMax)} ❄</b> contre un joueur. Une course en direct,{' '}
          <b>une chance sur deux</b> : le gagnant rafle les deux mises.
        </>
      ),
    },
  ];

  return (
    <div className="accueil">
      {/* ---- Le centre, et les boosters autour ---- */}
      <section className="acc-hero" aria-labelledby="accueil-titre">
        <VitrineBoosters boosters={boosters} />
        <div className="acc-centre">
          <p className="acc-surtitre">Warzone · en direct sur Twitch</p>
          <h1 id="accueil-titre" className="hero-titre acc-titre">
            <span className="glace" data-text="Winter">
              Winter
            </span>{' '}
            <em className="glace" data-text="Ligue">
              Ligue
            </em>
          </h1>
          <p className="acc-lead">
            Joue tes games, grimpe au classement, ouvre des boosters, défie les autres.
          </p>
          <div className="acc-actions">{rejoindre}</div>
          {!twitchEnabled && (
            <p className="acc-note">
              La connexion Twitch ouvre bientôt.
              {devLogin ? ' La connexion de développement reste ouverte en local.' : ''}
            </p>
          )}
          <CalendrierSaisons saisons={saisons} maintenant={Date.now()} />
        </div>
      </section>

      {/* ---- La ligue en cinq étapes, en blocs de glace ---- */}
      <section className="acc-etapes" aria-labelledby="etapes-titre">
        <header className="acc-etapes-tete">
          <span className="acc-etapes-trait" aria-hidden="true" />
          <h2 id="etapes-titre">Comment ça marche</h2>
          <span className="acc-etapes-trait" aria-hidden="true" />
        </header>
        <PaquetEtapes label="La ligue en cinq étapes" etapes={etapes} />
        <div className="acc-fin">{rejoindre}</div>
      </section>
    </div>
  );
}
