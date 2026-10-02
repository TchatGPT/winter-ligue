import type { CSSProperties, ReactNode } from 'react';
import { BoosterPack3D } from '@/components/BoosterPack3D';
import { CouronneGlace } from '@/components/CouronneGlace';
import { Diaporama, type Diapositive } from '@/components/Diaporama';
import { EventailBoosters } from '@/components/EventailBoosters';
import { MedailleGlace } from '@/components/MedailleGlace';
import { SnowCap } from '@/components/SnowCap';
import { IconJauge, IconPack, IconSnowflake, IconSwords, IconTrophy, IconTwitch } from '@/components/icons';
import { GEMME_DU_PACK, PACKS, packArt } from '@/lib/domain/catalog';
import {
  CADEAU_DU_JOUR,
  CARD_IMPACT_CAP,
  CHANCE,
  ECONOMY,
  PALIERS_CHANCE,
  PLACEMENT_POINTS,
  SEASON,
} from '@/lib/domain/rules';
import { num } from '@/lib/format';

/**
 * L'accueil, quand on n'est pas connecté.
 *
 * Rien de la ligue n'est visible sans compte : ni classement, ni joueurs, ni
 * duels en cours. La page dit l'essentiel, et le montre :
 *
 *  - le hero, à même le ciel des boosters : le nom, une phrase, l'entrée par
 *    Twitch, et les quatre boosters distribués en éventail à l'arrivée, qui
 *    suivent la souris ;
 *  - puis la ligue en six cartes de verre (`Diaporama`), qu'on tire du doigt
 *    ou à la souris : le classement, les flocons, les boosters, la chance,
 *    les duels, et comment entrer. Une image, un titre, une phrase.
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
 * Une carte de la ligue : son numéro, son thème et son médaillon, puis la
 * fenêtre où vit son image — teintée à la couleur de la carte —, le titre et
 * la phrase.
 */
function Carte({
  numero,
  total,
  eyebrow,
  icone,
  teinte,
  titre,
  visuel,
  visuelLu = false,
  action,
  children,
}: {
  numero: number;
  total: number;
  eyebrow: string;
  icone: ReactNode;
  /** La couleur de la fenêtre : une variable du thème. */
  teinte: string;
  titre: string;
  visuel: ReactNode;
  /** L'image dit quelque chose qu'un lecteur d'écran doit entendre. */
  visuelLu?: boolean;
  action?: ReactNode;
  children: ReactNode;
}) {
  const deux = (x: number) => String(x).padStart(2, '0');
  return (
    <article className="carte-ligue" style={{ ['--teinte' as string]: teinte } as CSSProperties}>
      <SnowCap radius="30px" seed={`carte-ligue-${numero}`} epaisseur={14} />
      <header className="carte-ligue-tete">
        <span className="carte-ligue-num">
          {deux(numero)}
          <small>/{deux(total)}</small>
        </span>
        <p className="eyebrow">{eyebrow}</p>
        <span className="carte-ligue-icone" aria-hidden="true">
          {icone}
        </span>
      </header>
      <div className="carte-ligue-visuel" aria-hidden={visuelLu ? undefined : true}>
        {visuel}
      </div>
      <h3>{titre}</h3>
      <p className="carte-ligue-texte">{children}</p>
      {action && <div className="carte-ligue-action">{action}</div>}
    </article>
  );
}

/** Le podium : la couronne et les médailles sur leurs marches de glace. */
function Podium() {
  return (
    <ol className="acc-v-podium">
      {([2, 1, 3] as const).map((rang) => (
        <li key={rang} data-rang={rang}>
          {rang === 1 ? (
            <CouronneGlace className="acc-v-podium-icone" id="couronne-carte" />
          ) : (
            <MedailleGlace rang={rang} className="acc-v-podium-icone" id={`medaille-${rang}-carte`} />
          )}
          <span className="acc-v-marche">
            <b>+{PLACEMENT_POINTS[String(rang) as '1' | '2' | '3']}</b>
            <small>Top {rang}</small>
          </span>
        </li>
      ))}
    </ol>
  );
}

/** Ce que rapportent les flocons, en trois pastilles en quinconce. */
function Gains() {
  const GAINS = [
    { n: ECONOMY.perKill, quoi: 'par kill' },
    { n: ECONOMY.perPlacement['1'], quoi: 'par Top 1' },
    { n: CADEAU_DU_JOUR.parJour, quoi: 'chaque jour' },
  ];
  return (
    <ul className="acc-v-gains">
      {GAINS.map((g) => (
        <li key={g.quoi}>
          <b>+{num(g.n)}</b>
          <i>❄</i>
          <span>{g.quoi}</span>
        </li>
      ))}
    </ul>
  );
}

/** Les quatre boosters, en petit éventail. */
function Sachets() {
  return (
    <div className="acc-v-sachets">
      {PACKS.map((p, i) => (
        <div
          key={p.id}
          className="acc-v-sachet"
          style={{ ['--o' as string]: i - 1.5, ['--o-abs' as string]: Math.abs(i - 1.5) } as CSSProperties}
        >
          <BoosterPack3D
            name={p.name}
            cardCount={1}
            gradient={p.gradient}
            art={packArt(p.id)}
            rarete={GEMME_DU_PACK[p.id]}
            vignette
          />
        </div>
      ))}
    </div>
  );
}

/**
 * La chance : le multiplicateur maximal en grand, et l'escalier des paliers
 * dessous — les flocons en abscisse, le multiplicateur en ordonnée.
 */
function Chance() {
  const X = (des: number) => (des / CHANCE.floconsPourPlein) * 300;
  const Y = (m: number) => 100 - ((m - 1) / CHANCE.max) * 92;
  const marches = PALIERS_CHANCE.map((p, i) => {
    const suivant = PALIERS_CHANCE[i + 1]?.des ?? CHANCE.floconsPourPlein;
    return `${i === 0 ? 'M' : 'L'}${X(p.des).toFixed(1)} ${Y(p.multiplicateur).toFixed(1)}H${X(suivant).toFixed(1)}`;
  }).join('');
  return (
    <div className="acc-v-chance">
      <p className="acc-v-chance-max">
        <span>jusqu’à</span>
        <b className="glace" data-text={`×${1 + CHANCE.max}`}>
          ×{1 + CHANCE.max}
        </b>
      </p>
      <svg className="acc-v-escalier" viewBox="0 0 300 100" preserveAspectRatio="none">
        <defs>
          <linearGradient id="escalier-aire" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" style={{ stopColor: 'var(--ice-3)', stopOpacity: 0.25 }} />
            <stop offset="0.6" style={{ stopColor: 'var(--ice)', stopOpacity: 0.4 }} />
            <stop offset="1" style={{ stopColor: 'var(--aurora)', stopOpacity: 0.6 }} />
          </linearGradient>
        </defs>
        <path d={`${marches}V100H0Z`} fill="url(#escalier-aire)" />
        <path d={marches} className="acc-v-escalier-ligne" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}

/** Le duel : toi contre un joueur, et le pot entre les deux. */
function Duel() {
  return (
    <div className="acc-v-duel">
      <div className="acc-v-camp">
        <span className="orbe">T</span>
        <b>Toi</b>
      </div>
      <div className="acc-v-pot">
        <span className="acc-v-vs">VS</span>
        <strong>
          {num(2 * 1_000)} <i>❄</i>
        </strong>
        <small>au gagnant</small>
      </div>
      <div className="acc-v-camp">
        <span className="orbe" data-inconnu="">
          ?
        </span>
        <b>Un joueur</b>
      </div>
    </div>
  );
}

/** Les trois gestes pour entrer. */
function Etapes() {
  const ETAPES = ['Connecte-toi avec Twitch', 'Donne ton pseudo Activision', 'Joue tes games'];
  return (
    <ol className="acc-v-etapes">
      {ETAPES.map((e, i) => (
        <li key={e}>
          <span aria-hidden="true">{i + 1}</span>
          {e}
        </li>
      ))}
    </ol>
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

  const CARTES: { cle: string; titre: string; carte: Omit<Parameters<typeof Carte>[0], 'numero' | 'total'> }[] = [
    {
      cle: 'classement',
      titre: 'Le classement',
      carte: {
        eyebrow: 'Le classement',
        icone: <IconTrophy className="h-5 w-5" />,
        teinte: 'var(--gold)',
        titre: 'Chaque kill compte',
        visuel: <Podium />,
        children: `Un kill vaut un point, un Top 1 en ajoute ${PLACEMENT_POINTS['1']}. En fin de saison, les ${SEASON.finalistCount} premiers jouent la finale.`,
      },
    },
    {
      cle: 'flocons',
      titre: 'Les flocons',
      carte: {
        eyebrow: 'Les flocons',
        icone: <IconSnowflake className="h-5 w-5" />,
        teinte: 'var(--ice)',
        titre: 'Tes games rapportent des flocons',
        visuel: <Gains />,
        children: 'Ils ne s’achètent pas : tu les gagnes en jouant, et un cadeau t’attend chaque jour.',
      },
    },
    {
      cle: 'boosters',
      titre: 'Les boosters',
      carte: {
        eyebrow: 'Les boosters',
        icone: <IconPack className="h-5 w-5" />,
        teinte: 'var(--violet)',
        titre: 'Les subs font tomber des boosters',
        visuel: <Sachets />,
        children: `Ouverts en live, chacun donne une carte qui change une game : jusqu’à ${CARD_IMPACT_CAP} points, bonus ou malus.`,
      },
    },
    {
      cle: 'chance',
      titre: 'La chance',
      carte: {
        eyebrow: 'La chance',
        icone: <IconJauge className="h-5 w-5" />,
        teinte: 'var(--aurora)',
        titre: 'Garde tes flocons, tire plus haut',
        visuel: <Chance />,
        children: 'Plus ta réserve est grosse, plus tes boosters sortent des cartes rares.',
      },
    },
    {
      cle: 'duels',
      titre: 'Les duels',
      carte: {
        eyebrow: 'Les duels',
        icone: <IconSwords className="h-5 w-5" />,
        teinte: 'var(--ice-2)',
        titre: 'Mise tes flocons en duel',
        visuel: <Duel />,
        children: 'La même mise des deux côtés, une chance sur deux : le gagnant rafle tout.',
      },
    },
    {
      cle: 'entrer',
      titre: 'Pour entrer',
      carte: {
        eyebrow: 'Pour entrer',
        icone: <IconTwitch className="h-5 w-5" />,
        teinte: 'var(--twitch-clair)',
        titre: 'À toi de jouer',
        visuel: <Etapes />,
        visuelLu: true,
        action: rejoindre,
        children: avantLaSaison ? `Coup d’envoi le ${debut}.` : `En jeu jusqu’au ${fin}.`,
      },
    },
  ];

  const DIAPOS: Diapositive[] = CARTES.map(({ cle, titre, carte }, i) => ({
    cle,
    titre,
    contenu: <Carte numero={i + 1} total={CARTES.length} {...carte} />,
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

      {/* ---- La ligue, en six cartes de verre ---- */}
      <section id="ligue" className="acc-ligue" aria-labelledby="ligue-titre">
        <header className="acc-ligue-tete">
          <p className="eyebrow">Comment ça marche</p>
          <h2 id="ligue-titre" className="titre-glace titre-glace-page">
            <span className="glace" data-text="La ligue en six cartes">
              La ligue en six cartes
            </span>
          </h2>
          <p className="acc-ligue-indice">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M8 9 5 12l3 3M16 9l3 3-3 3M5 12h14" />
            </svg>
            Fais glisser les cartes
          </p>
        </header>
        <Diaporama label="La ligue en six cartes" diapositives={DIAPOS} />
      </section>
    </div>
  );
}
