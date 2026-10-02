import type { CSSProperties, ReactNode } from 'react';
import { BoosterPack3D } from '@/components/BoosterPack3D';
import { CouronneGlace } from '@/components/CouronneGlace';
import { Diaporama, type Diapositive } from '@/components/Diaporama';
import { MedailleGlace } from '@/components/MedailleGlace';
import { SnowCap } from '@/components/SnowCap';
import { IconTwitch } from '@/components/icons';
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
 * duels en cours. La page dit l'essentiel, et rien de plus : le nom, une
 * phrase, l'entrée par Twitch, les quatre boosters en éventail — puis un
 * diaporama de six plaques de verre, une idée chacune : le classement, les
 * flocons, les boosters, la chance, les duels, et comment entrer. Une image,
 * un titre, une ou deux phrases. Le détail est dans les règles, une fois
 * connecté.
 *
 * Toutes les valeurs viennent de `lib/domain/rules` et du catalogue : la page
 * ne peut pas dire autre chose que ce que le serveur applique.
 *
 * Elle se pose sur le ciel des boosters (`FondAurores`) : le hero à même le
 * ciel, les diapositives sur le verre.
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
 * Une diapositive : sa neige, son image, son titre, sa phrase. Le texte vient
 * d'abord dans le document — c'est lui qu'on lit —, l'image se place devant
 * à l'écran.
 */
function Diapo({
  graine,
  eyebrow,
  titre,
  visuel,
  visuelLu = false,
  action,
  children,
}: {
  graine: string;
  eyebrow: string;
  titre: string;
  visuel: ReactNode;
  /** L'image dit quelque chose qu'un lecteur d'écran doit entendre. */
  visuelLu?: boolean;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <article className="glass acc-diapo">
      <SnowCap radius="var(--r-lg)" seed={`diapo-${graine}`} epaisseur={16} />
      <div className="acc-diapo-texte">
        <p className="eyebrow">{eyebrow}</p>
        <h2>{titre}</h2>
        <p>{children}</p>
        {action && <div className="acc-diapo-action">{action}</div>}
      </div>
      <div className="acc-diapo-visuel" aria-hidden={visuelLu ? undefined : true}>
        {visuel}
      </div>
    </article>
  );
}

/** Le podium : la couronne et les médailles sur leurs marches, et le kill. */
function Podium() {
  return (
    <div className="acc-v-podium">
      <ol>
        {([2, 1, 3] as const).map((rang) => (
          <li key={rang} data-rang={rang}>
            {rang === 1 ? (
              <CouronneGlace className="acc-v-podium-icone" id="couronne-diapo" />
            ) : (
              <MedailleGlace rang={rang} className="acc-v-podium-icone" id={`medaille-${rang}-diapo`} />
            )}
            <span className="acc-v-marche">
              <b>+{PLACEMENT_POINTS[String(rang) as '1' | '2' | '3']}</b>
              <small>Top {rang}</small>
            </span>
          </li>
        ))}
      </ol>
      <p className="acc-v-kill">
        <b>+1</b> par kill
      </p>
    </div>
  );
}

/** Ce que rapportent les flocons, en trois pastilles qui flottent. */
function Gains() {
  const GAINS = [
    { n: ECONOMY.perKill, quoi: 'par kill' },
    { n: ECONOMY.perPlacement['1'], quoi: 'par Top 1' },
    { n: CADEAU_DU_JOUR.parJour, quoi: 'chaque jour' },
  ];
  return (
    <ul className="acc-v-gains">
      {GAINS.map((g, k) => (
        <li key={g.quoi} style={{ ['--k' as string]: k } as CSSProperties}>
          <b>+{num(g.n)}</b>
          <i>❄</i>
          <span>{g.quoi}</span>
        </li>
      ))}
    </ul>
  );
}

/** Les quatre boosters, côte à côte. */
function Sachets() {
  return (
    <div className="acc-v-sachets">
      {PACKS.map((p) => (
        <div key={p.id} className="acc-v-sachet">
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
 * L'escalier de la chance : les flocons en abscisse (0 → plafond), le
 * multiplicateur en ordonnée (×1 → ×4), dans une boîte de 300 × 120. Une
 * bille grimpe les paliers, s'attarde au plafond, s'efface et repart.
 */
function Escalier() {
  const X = (des: number) => (des / CHANCE.floconsPourPlein) * 300;
  const Y = (m: number) => 112 - ((m - 1) / CHANCE.max) * 100;
  const marches = PALIERS_CHANCE.map((p, i) => {
    const suivant = PALIERS_CHANCE[i + 1]?.des ?? CHANCE.floconsPourPlein;
    return `${i === 0 ? 'M' : 'L'}${X(p.des).toFixed(1)} ${Y(p.multiplicateur).toFixed(1)}H${X(suivant).toFixed(1)}`;
  }).join('');
  return (
    <svg className="acc-v-escalier" viewBox="-30 -8 340 142">
      <defs>
        <linearGradient id="escalier-aire" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" style={{ stopColor: 'var(--ice-3)', stopOpacity: 0.35 }} />
          <stop offset="0.6" style={{ stopColor: 'var(--ice)', stopOpacity: 0.4 }} />
          <stop offset="1" style={{ stopColor: 'var(--aurora)', stopOpacity: 0.5 }} />
        </linearGradient>
      </defs>
      {[1, 1 + CHANCE.max].map((m) => (
        <g key={m}>
          <line x1="0" x2="300" y1={Y(m)} y2={Y(m)} className="acc-v-escalier-grille" />
          <text x="-8" y={Y(m) + 5} className="acc-v-escalier-y">
            ×{m}
          </text>
        </g>
      ))}
      <path d={`${marches}V112H0Z`} fill="url(#escalier-aire)" />
      <path id="escalier-marches" d={marches} className="acc-v-escalier-ligne" />
      <circle r="6" className="acc-v-escalier-bille">
        <animateMotion dur="9s" repeatCount="indefinite" calcMode="linear" keyPoints="0;1;1" keyTimes="0;0.82;1">
          <mpath href="#escalier-marches" />
        </animateMotion>
        <animate attributeName="opacity" dur="9s" repeatCount="indefinite" values="0;1;1;0" keyTimes="0;0.05;0.92;1" />
      </circle>
      <text x="0" y="132" className="acc-v-escalier-x">
        0 ❄
      </text>
      <text x="300" y="132" className="acc-v-escalier-x" textAnchor="end">
        {num(CHANCE.floconsPourPlein)} ❄
      </text>
    </svg>
  );
}

/** Le duel : toi, un joueur, le pot — et une boule de neige qui passe de l'un à l'autre. */
function Duel() {
  return (
    <div className="acc-affiche">
      <span className="acc-boule">
        <span className="acc-boule-x">
          <span className="acc-boule-y" />
        </span>
      </span>
      <div className="acc-camp">
        <span className="orbe">T</span>
        <b>Toi</b>
      </div>
      <div className="acc-pot">
        <small>Le gagnant rafle</small>
        <strong>
          {num(2 * 1_000)} <span className="text-ice">❄</span>
        </strong>
        <small>pour {num(1_000)} misés</small>
      </div>
      <div className="acc-camp">
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
  const ETAPES = ['Connecte-toi avec Twitch', 'Donne ton pseudo Activision', 'Joue, la modération saisit tes games'];
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

  const DIAPOS: Diapositive[] = [
    {
      cle: 'classement',
      titre: 'Le classement',
      contenu: (
        <Diapo graine="classement" eyebrow="Le classement" titre="Chaque kill compte" visuel={<Podium />}>
          Un kill vaut un point, et un Top 1 en ajoute {PLACEMENT_POINTS['1']}. À la fin de la saison, les{' '}
          {SEASON.finalistCount} premiers jouent la finale.
        </Diapo>
      ),
    },
    {
      cle: 'flocons',
      titre: 'Les flocons',
      contenu: (
        <Diapo graine="flocons" eyebrow="Les flocons" titre="Tes games te rapportent des flocons" visuel={<Gains />}>
          Ils ne s’achètent pas : tu les gagnes en jouant, et un cadeau t’attend chaque jour.
        </Diapo>
      ),
    },
    {
      cle: 'boosters',
      titre: 'Les boosters',
      contenu: (
        <Diapo graine="boosters" eyebrow="Les boosters" titre="Les subs font tomber des boosters" visuel={<Sachets />}>
          Ouverts en live, chacun donne une carte qui change une game : jusqu’à {CARD_IMPACT_CAP} points, en bonus ou en
          malus.
        </Diapo>
      ),
    },
    {
      cle: 'chance',
      titre: 'La chance',
      contenu: (
        <Diapo graine="chance" eyebrow="La chance" titre="Garde tes flocons, tire plus haut" visuel={<Escalier />}>
          Plus ta réserve est grosse, plus tes boosters sortent des cartes rares : jusqu’à ×{1 + CHANCE.max} de chance.
        </Diapo>
      ),
    },
    {
      cle: 'duels',
      titre: 'Les duels',
      contenu: (
        <Diapo graine="duels" eyebrow="Les duels" titre="Mise tes flocons en duel" visuel={<Duel />}>
          Un joueur contre un autre, la même mise des deux côtés. Une chance sur deux : le gagnant rafle tout.
        </Diapo>
      ),
    },
    {
      cle: 'entrer',
      titre: 'Pour entrer',
      contenu: (
        <Diapo
          graine="entrer"
          eyebrow="Pour entrer"
          titre="À toi de jouer"
          visuel={<Etapes />}
          visuelLu
          action={rejoindre}
        >
          {avantLaSaison
            ? `La saison commence le ${debut}. Connecte-toi dès maintenant : ton nom t’attend dans la ligue.`
            : `La saison court jusqu’au ${fin}. Connecte-toi : la prochaine game est pour toi.`}
        </Diapo>
      ),
    },
  ];

  return (
    <div className="accueil">
      {/* ---- Le hero, à même le ciel : le nom, une phrase, l'entrée, et les
              quatre boosters en éventail dans leur fumée. ---- */}
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

        <div className="acc-eventail" aria-hidden="true">
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
              // La place dans l'arc : -1,5 à gauche, +1,5 à droite.
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
      </section>

      {/* ---- La ligue, en six plaques de verre ---- */}
      <Diaporama id="ligue" label="La ligue en six diapositives" diapositives={DIAPOS} />
    </div>
  );
}
