import { CalendrierSaisons, type SaisonDuCalendrier } from '@/components/CalendrierSaisons';
import { type EtapeDuPaquet, PaquetEtapes } from '@/components/PaquetEtapes';
import { type BoosterEnVitrine, VitrineBoosters } from '@/components/VitrineBoosters';
import { IconJauge, IconPack, IconSnowflake, IconSwords, IconTrophy, IconTwitch } from '@/components/icons';
import { GEMME_DU_PACK, PACKS, packArt } from '@/lib/domain/catalog';
import { num } from '@/lib/format';
import {
  ACHAT_PERSO,
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
 *  - à gauche, sur la nuit : le nom, une phrase, l'entrée par Twitch, et le
 *    calendrier (`CalendrierSaisons`) — le compte à rebours, puis les deux
 *    saisons de l'hiver, la Mini Ligue pour se chauffer et la Saison 2, la
 *    vraie, qui repart de zéro le 4 janvier ;
 *  - à droite, la vitrine (`VitrineBoosters`) : les quatre boosters en
 *    lévitation au-dessus d'une banquise, leur reflet dans la glace, et un
 *    cartel par booster : pour qui il est, ce qui le fait tomber ;
 *  - en bas, sur la glace, la ligue en cinq étapes en paquet de cartes de
 *    verre (`PaquetEtapes`), qu'on fait tourner à la souris, au doigt, au
 *    clavier — l'essentiel, le détail est dans les règles une fois connecté.
 *
 * Sur un téléphone ou une tablette debout, tout s'empile et la page défile :
 * la vitrine, le nom et l'entrée, le calendrier, puis les étapes.
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
  const [mini, deuxieme] = SAISONS;
  const nomCourt = (s: (typeof SAISONS)[number]) => s.nom.split(' · ').at(-1) ?? s.nom;

  const saisons: SaisonDuCalendrier[] = SAISONS.map((s) => ({
    numero: s.numero,
    nom: nomCourt(s),
    role: s.numero === 1 ? 'l’échauffement' : 'la vraie saison',
    dates: fleche(s.periode),
    detail:
      s.finalistes > 0
        ? `${s.games} games · finale des ${s.finalistes} premiers`
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

  // Ce qui fait tomber chaque booster : en quelques mots sur son cartel, en
  // entier dans sa fenêtre.
  const palier = (id: string) => SUB_MILESTONES.find((m) => m.packId === id)?.every ?? 0;
  const sortDesigne = 'Le sort désigne sur qui tombe sa carte : un joueur, deux, trois… ou toute la ligue.';
  const PRESENTATION: Record<string, Pick<BoosterEnVitrine, 'quand' | 'pour' | 'comment' | 'qui'>> = {
    perso: {
      quand: `1 sub T3 ou ${PACKS_REGLES.persoTousLes} subs offerts`,
      pour: 'toi',
      comment: `Un sub T3, pris ou offert, ou ${PACKS_REGLES.persoTousLes} subs offerts : un Booster Perso pour qui les paie. Aussi le ${CADEAU_DU_JOUR.cycle}ᵉ jour d’affilée du cadeau du jour, ou contre ${num(ACHAT_PERSO.prix)} ❄.`,
      qui: 'Sa carte est pour toi.',
    },
    commu: {
      quand: `tous les ${palier('commu')} subs du live`,
      pour: 'ligue',
      comment: `Il tombe tous les ${palier('commu')} subs du live, pour toute la ligue.`,
      qui: sortDesigne,
    },
    folie: {
      quand: `tous les ${palier('folie')} subs du live`,
      pour: 'ligue',
      comment: `Il tombe tous les ${palier('folie')} subs du live. Rien en dessous de rare : les cartes les plus folles.`,
      qui: sortDesigne,
    },
    finisseur: {
      quand: `à ta ${saison.finisseurA}ᵉ game`,
      pour: 'toi',
      comment: `Pour qui va au bout : à ta ${mini.finisseurA}ᵉ game en ${nomCourt(mini)}, à ta ${deuxieme.finisseurA}ᵉ en ${nomCourt(deuxieme)}.`,
      qui: 'Sa carte est pour toi.',
    },
  };
  const boosters: BoosterEnVitrine[] = PACKS.map((p) => ({
    id: p.id,
    nom: p.name,
    court: p.name.replace(/^Booster\s+/, ''),
    ...(PRESENTATION[p.id] ?? { quand: p.tagline, pour: 'ligue', comment: p.declencheur, qui: p.pourQui }),
    gradient: p.gradient,
    art: packArt(p.id),
    rarete: GEMME_DU_PACK[p.id],
  }));

  const etapes: EtapeDuPaquet[] = [
    {
      cle: 'classement',
      numero: 1,
      teinte: 'var(--gold)',
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
      numero: 2,
      teinte: 'var(--ice)',
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
      numero: 3,
      teinte: 'var(--violet)',
      theme: 'Les boosters',
      icone: <IconPack />,
      titre: 'Ouvre des boosters',
      texte: (
        <>
          Les subs du live en font tomber, ouverts <b>en direct</b>. Chacun donne <b>une carte</b> qui change une
          game : bonus ou malus.
        </>
      ),
    },
    {
      cle: 'chance',
      numero: 4,
      teinte: 'var(--aurora)',
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
      numero: 5,
      teinte: 'color-mix(in srgb, var(--live) 55%, var(--violet))',
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
      {/* ---- La nuit à gauche, la vitrine à droite ---- */}
      <section className="acc-scene" aria-labelledby="accueil-titre">
        <div className="acc-texte">
          <p className="acc-surtitre">Warzone · Hiver 2026 – 2027</p>
          <h1 id="accueil-titre" className="hero-titre acc-titre">
            <span className="glace" data-text="Winter">
              Winter
            </span>{' '}
            <em className="glace" data-text="Ligue">
              Ligue
            </em>
          </h1>
          <p className="acc-lead">
            La ligue Warzone de l’hiver, en direct sur Twitch.{' '}
            <span className="acc-lead-suite">
              Joue tes games, grimpe au classement, ouvre des boosters et défie les autres joueurs.
            </span>
          </p>
          <div className="acc-actions">
            {rejoindre}
            <p className="acc-note">
              {twitchEnabled
                ? 'Ton compte Twitch suffit : pas de mot de passe.'
                : `La connexion Twitch ouvre bientôt.${devLogin ? ' La connexion de développement reste ouverte en local.' : ''}`}
            </p>
          </div>
          <CalendrierSaisons saisons={saisons} maintenant={Date.now()} />
        </div>

        <VitrineBoosters boosters={boosters} />
      </section>

      {/* ---- La ligue en cinq étapes, en paquet de cartes de verre ---- */}
      <section className="acc-etapes" aria-labelledby="etapes-titre">
        <header className="acc-etapes-tete">
          <h2 id="etapes-titre">
            <span className="acc-etapes-sur">Comment ça marche</span>
            <span className="acc-etapes-grand">La ligue en cinq étapes</span>
          </h2>
          <span className="acc-etapes-trait" aria-hidden="true" />
          <p className="acc-etapes-indice">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M8 9 5 12l3 3M16 9l3 3-3 3M5 12h14" />
            </svg>
            Fais glisser les cartes
          </p>
        </header>
        <PaquetEtapes label="La ligue en cinq étapes" etapes={etapes} />
        <div className="acc-fin">{rejoindre}</div>
      </section>
    </div>
  );
}
