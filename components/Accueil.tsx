import type { CSSProperties, ReactNode } from 'react';
import { BoosterPack3D } from '@/components/BoosterPack3D';
import { Diaporama, type Diapositive } from '@/components/Diaporama';
import { EventailBoosters } from '@/components/EventailBoosters';
import { SnowCap } from '@/components/SnowCap';
import { IconJauge, IconPack, IconSnowflake, IconSwords, IconTrophy, IconTwitch } from '@/components/icons';
import { GEMME_DU_PACK, PACKS, packArt } from '@/lib/domain/catalog';
import { CADEAU_DU_JOUR, CARD_IMPACT_CAP, CHANCE, ECONOMY, PLACEMENT_POINTS, SEASON } from '@/lib/domain/rules';

/**
 * L'accueil, quand on n'est pas connecté.
 *
 * Rien de la ligue n'est visible sans compte : ni classement, ni joueurs, ni
 * duels en cours. La page dit l'essentiel, et le montre :
 *
 *  - le hero, à même le ciel des boosters : le nom, une phrase, l'entrée par
 *    Twitch, et les quatre boosters distribués en éventail à l'arrivée, qui
 *    suivent la souris ;
 *  - puis la ligue en cinq dalles de glace (`Diaporama`), qu'on tire du doigt
 *    ou à la souris : le classement, les flocons, les boosters, la chance,
 *    les duels. Chacune porte un grand nombre taillé dans la glace, une
 *    légende, un titre et une phrase ; derrière le paquet, des nappes
 *    d'aurore que le verre floute et dont il se colore.
 *
 * Le détail est dans les règles, une fois connecté. Toutes les valeurs
 * viennent de `lib/domain/rules` et du catalogue : la page ne peut pas dire
 * autre chose que ce que le serveur applique.
 */

const MOIS = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
];

/** « 1er décembre », « 15 mars ». Les bornes de la saison sont à minuit UTC. */
function jourDe(iso: string): string {
  const d = new Date(iso);
  const jour = d.getUTCDate();
  return `${jour === 1 ? '1er' : jour} ${MOIS[d.getUTCMonth()]}`;
}

/**
 * Une dalle de la ligue, taillée dans la glace : le givre sur la face, son
 * épaisseur, le thème en haut, au cœur un grand nombre en glace et sa
 * légende, puis le titre et la phrase. La lumière prise dans la glace est à
 * la couleur de la dalle (`teinte`).
 */
function Dalle({
  numero,
  total,
  teinte,
  eyebrow,
  icone,
  chiffre,
  flocon = false,
  legende,
  titre,
  children,
}: {
  numero: number;
  total: number;
  /** Une couleur du thème : `var(--gold)`… */
  teinte: string;
  eyebrow: string;
  icone: ReactNode;
  /** Le nombre, en grand : « +20 », « ×4 ». */
  chiffre: string;
  /** Un flocon après le nombre. */
  flocon?: boolean;
  legende: string;
  titre: string;
  children: ReactNode;
}) {
  const deux = (x: number) => String(x).padStart(2, '0');
  return (
    <article className="carte-glace" style={{ ['--teinte' as string]: teinte } as CSSProperties}>
      <span className="carte-glace-givre" aria-hidden="true" />
      <span className="carte-glace-epaisseur" aria-hidden="true" />
      <SnowCap radius="30px" seed={`dalle-${numero}`} epaisseur={14} />
      <header className="carte-glace-tete">
        <span className="carte-glace-icone" aria-hidden="true">
          {icone}
        </span>
        <p className="eyebrow">{eyebrow}</p>
        <span className="carte-glace-num" aria-hidden="true">
          {deux(numero)}/{deux(total)}
        </span>
      </header>
      <div className="carte-glace-coeur">
        <p className="carte-glace-chiffre">
          <b className="glace" data-text={chiffre}>
            {chiffre}
          </b>
          {flocon && <IconSnowflake />}
        </p>
        <p className="carte-glace-legende">{legende}</p>
      </div>
      <div className="carte-glace-texte">
        <h3>{titre}</h3>
        <p>{children}</p>
      </div>
    </article>
  );
}

export function Accueil({ twitchEnabled, devLogin }: { twitchEnabled: boolean; devLogin: boolean }) {
  const debut = jourDe(SEASON.startsAt);
  const fin = jourDe(SEASON.endsAt);
  const avantLaSaison = Date.now() < Date.parse(SEASON.startsAt);

  // Twitch branché, on part chez lui ; sinon la page de connexion dit que la
  // connexion ouvre bientôt, et garde l'entrée de l'administration.
  const entree = twitchEnabled ? '/api/auth/twitch?returnTo=/' : '/connexion';
  const rejoindre = (
    <a href={entree} className="btn btn-twitch btn-lg no-underline">
      <IconTwitch className="h-5 w-5" />
      Rejoindre avec Twitch
    </a>
  );

  const DALLES: { cle: string; titre: string; dalle: Omit<Parameters<typeof Dalle>[0], 'numero' | 'total'> }[] = [
    {
      cle: 'classement',
      titre: 'Le classement',
      dalle: {
        teinte: 'var(--gold)',
        eyebrow: 'Le classement',
        icone: <IconTrophy className="h-5 w-5" />,
        chiffre: `+${PLACEMENT_POINTS['1']}`,
        legende: 'le Top 1 · +1 par kill',
        titre: 'Chaque kill compte',
        children: `Tes kills et tes Top 3 font ton score. Les ${SEASON.finalistCount} premiers jouent la finale.`,
      },
    },
    {
      cle: 'flocons',
      titre: 'Les flocons',
      dalle: {
        teinte: 'var(--ice)',
        eyebrow: 'Les flocons',
        icone: <IconSnowflake className="h-5 w-5" />,
        chiffre: `+${ECONOMY.perKill}`,
        flocon: true,
        legende: 'flocons par kill',
        titre: 'Tes games rapportent des flocons',
        children: `+${ECONOMY.perPlacement['1']} le Top 1, +${CADEAU_DU_JOUR.parJour} chaque jour. Ils ne s’achètent pas.`,
      },
    },
    {
      cle: 'boosters',
      titre: 'Les boosters',
      dalle: {
        teinte: 'var(--violet)',
        eyebrow: 'Les boosters',
        icone: <IconPack className="h-5 w-5" />,
        chiffre: String(PACKS.length),
        legende: 'boosters, ouverts en live',
        titre: 'Les subs font tomber des boosters',
        children: `Chacun donne une carte qui change une game : jusqu’à ${CARD_IMPACT_CAP} points, bonus ou malus.`,
      },
    },
    {
      cle: 'chance',
      titre: 'La chance',
      dalle: {
        teinte: 'var(--aurora)',
        eyebrow: 'La chance',
        icone: <IconJauge className="h-5 w-5" />,
        chiffre: `×${1 + CHANCE.max}`,
        legende: 'de chance, au plus',
        titre: 'Garde tes flocons, tire plus haut',
        children: 'Plus ta réserve est grosse, plus tes boosters sortent des cartes rares.',
      },
    },
    {
      cle: 'duels',
      titre: 'Les duels',
      dalle: {
        teinte: 'color-mix(in srgb, var(--live) 55%, var(--violet))',
        eyebrow: 'Les duels',
        icone: <IconSwords className="h-5 w-5" />,
        chiffre: '×2',
        legende: 'ta mise, si tu gagnes',
        titre: 'Mise tes flocons en duel',
        children: 'La même mise des deux côtés, une chance sur deux : le gagnant rafle tout.',
      },
    },
  ];

  const DIAPOS: Diapositive[] = DALLES.map(({ cle, titre, dalle }, i) => ({
    cle,
    titre,
    contenu: <Dalle numero={i + 1} total={DALLES.length} {...dalle} />,
  }));

  return (
    <div className="accueil">
      {/* ---- Le hero, à même le ciel : le nom, une phrase, l'entrée, et les
              quatre boosters distribués en éventail dans leur fumée. ---- */}
      <section className="acc-hero" aria-labelledby="accueil-titre">
        <div className="acc-hero-texte">
          <p className="eyebrow">
            {SEASON.edition} · du {debut} au {fin}
          </p>
          <h1 id="accueil-titre" className="hero-titre acc-titre">
            <span className="glace" data-text="Winter">
              Winter
            </span>{' '}
            <em className="glace" data-text="Ligue">
              Ligue
            </em>
          </h1>
          <p className="acc-hero-lead">
            La ligue Warzone de l’hiver, en direct sur Twitch. Joue, grimpe au classement, ouvre des boosters et défie
            les autres joueurs.
          </p>
          <div className="acc-hero-actions">
            {rejoindre}
            <a href="#ligue" className="btn btn-lg no-underline">
              Comment ça marche
            </a>
          </div>
          {!twitchEnabled && (
            <p className="acc-hero-note">
              La connexion Twitch ouvre bientôt.
              {devLogin ? ' La connexion de développement reste ouverte en local.' : ''}
            </p>
          )}
        </div>

        <EventailBoosters>
          <div className="acc-eventail-cadre">
            <div className="acc-eventail-fumee fumee" data-pack="finisseur" data-niveau="4">
              <span className="fumee-nappe fumee-nappe-1" />
              <span className="fumee-nappe fumee-nappe-2" />
              <span className="fumee-nappe fumee-nappe-3" />
            </div>
          </div>
          {PACKS.map((p, i) => (
            <div
              key={p.id}
              className="acc-eventail-sachet"
              // La place dans l'arc (-1,5 à gauche, +1,5 à droite) et le rang
              // de distribution, du premier au dernier.
              style={
                {
                  ['--o' as string]: i - 1.5,
                  ['--o-abs' as string]: Math.abs(i - 1.5),
                  ['--rang' as string]: i,
                } as CSSProperties
              }
            >
              <div className="acc-eventail-parallaxe">
                <BoosterPack3D
                  name={p.name}
                  cardCount={1}
                  gradient={p.gradient}
                  art={packArt(p.id)}
                  rarete={GEMME_DU_PACK[p.id]}
                  vignette
                />
              </div>
            </div>
          ))}
        </EventailBoosters>
      </section>

      {/* ---- La ligue, en cinq dalles de glace ---- */}
      <section id="ligue" className="acc-ligue" aria-labelledby="ligue-titre">
        <header className="acc-ligue-tete">
          <p className="eyebrow">Comment ça marche</p>
          <h2 id="ligue-titre" className="titre-glace titre-glace-page">
            <span className="glace" data-text="La ligue en cinq cartes">
              La ligue en cinq cartes
            </span>
          </h2>
          <p className="acc-ligue-indice">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M8 9 5 12l3 3M16 9l3 3-3 3M5 12h14" />
            </svg>
            Fais glisser les cartes
          </p>
        </header>
        <Diaporama label="La ligue en cinq cartes" diapositives={DIAPOS} />
        <div className="acc-ligue-fin">
          {rejoindre}
          <p>{avantLaSaison ? `Coup d’envoi le ${debut}.` : `En jeu jusqu’au ${fin}.`}</p>
        </div>
      </section>
    </div>
  );
}
