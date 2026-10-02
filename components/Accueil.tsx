import type { CSSProperties, ReactNode } from 'react';
import { BoosterPack3D } from '@/components/BoosterPack3D';
import { CouronneGlace } from '@/components/CouronneGlace';
import { DirectTwitch } from '@/components/DirectTwitch';
import { EmblemePalier, type GlyphePalier } from '@/components/EmblemePalier';
import { EmblemeRarete } from '@/components/EmblemeRarete';
import { MedailleGlace } from '@/components/MedailleGlace';
import { SnowCap } from '@/components/SnowCap';
import { TitreGlace } from '@/components/TitreGlace';
import { IconImpact, IconTwitch } from '@/components/icons';
import { GEMME_DU_PACK, PACKS, RARITY_META, packArt } from '@/lib/domain/catalog';
import {
  CADEAU_DU_JOUR,
  CARD_IMPACT_CAP,
  CHANCE,
  DEFAULT_MAX_GAMES_PER_PLAYER,
  DUEL,
  ECONOMY,
  EVENEMENTS_SUBS,
  IMPACT_PAR_RARETE,
  PALIERS_CHANCE,
  PLACEMENT_POINTS,
  SEASON,
  SUB_MILESTONES,
  dureeLisible,
  poidsAvecChance,
  rarityPercent,
} from '@/lib/domain/rules';
import { CE_QUI_COMPTE, CE_QUI_NE_COMPTE_PAS } from '@/lib/domain/twitchSubs';
import type { PackDefinition, Rarity } from '@/lib/domain/types';
import { decimal, num } from '@/lib/format';

/**
 * L'accueil, quand on n'est pas connecté.
 *
 * Rien de la ligue n'est visible sans compte : ni classement, ni joueurs, ni
 * duels en cours. Cette page dit ce qu'est la ligue et comment elle marche —
 * le classement, les boosters et leurs cartes, les subs, les flocons, la
 * chance et les duels —, puis comment on y entre : Twitch, son pseudo
 * Activision, et jouer.
 *
 * Toutes les valeurs viennent de `lib/domain/rules` et du catalogue : la page
 * ne peut pas dire autre chose que ce que le serveur applique. Les taux sont
 * ceux du catalogue, sans lecture de la base — une page publique ne la charge
 * pas à chaque visite, et les taux ne se règlent plus depuis le site.
 *
 * Elle se pose sur le ciel des boosters (`FondAurores`) : le hero sans plaque,
 * à même le ciel, puis les explications sur le verre.
 */

const ECHELLE: Rarity[] = ['C', 'R', 'UR', 'L'];

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

/** Un pourcentage de tirage, lisible : « 0,2 % », « 62 % ». */
function pourcent(weights: Record<Rarity, number>, r: Rarity): string {
  return `${decimal(rarityPercent(weights, r))} %`;
}

/** Une ligne d'explication : un intitulé en capitales, et sa phrase. */
function Point({ titre, children }: { titre: ReactNode; children: ReactNode }) {
  return (
    <li>
      <b>{titre}</b>
      <span>{children}</span>
    </li>
  );
}

/** Un bloc d'explication : sa neige, son titre, sa phrase, et ce qu'il montre. */
function Bloc({
  id,
  className,
  eyebrow,
  titre,
  lead,
  children,
}: {
  id: string;
  className: string;
  eyebrow: string;
  titre: string;
  lead: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} className={`glass acc-bloc ${className}`} aria-labelledby={`${id}-titre`}>
      <SnowCap radius="var(--r-lg)" seed={`accueil-${id}`} epaisseur={16} />
      <header className="acc-bloc-tete">
        <p className="eyebrow">{eyebrow}</p>
        <h2 id={`${id}-titre`} className="titre-glace titre-glace-bloc">
          {titre}
        </h2>
        <p className="acc-bloc-lead">{lead}</p>
      </header>
      {children}
    </section>
  );
}

export function Accueil({ twitchEnabled, devLogin }: { twitchEnabled: boolean; devLogin: boolean }) {
  const debut = jourDe(SEASON.startsAt);
  const fin = jourDe(SEASON.endsAt);
  const avantLaSaison = Date.now() < Date.parse(SEASON.startsAt);

  // Twitch branché, on part chez lui ; sinon la page de connexion dit que la
  // connexion ouvre bientôt, et garde l'entrée de l'administration.
  const entree = twitchEnabled ? '/api/auth/twitch?returnTo=/' : '/connexion';

  const perso = PACKS.find((p) => p.id === 'perso') as PackDefinition;
  const pourSoi = PACKS.filter((p) => p.portee === 'JOUEUR');
  const collectifs = PACKS.filter((p) => p.portee !== 'JOUEUR');

  // La chance, en trois colonnes : rien, la moitié du chemin, le plafond.
  const COLONNES_CHANCE = [1, 2, 1 + CHANCE.max].map((m) => ({
    m,
    poids: poidsAvecChance(perso.weights, m - 1),
  }));

  // L'escalier des paliers : les flocons en abscisse (0 → plafond), le
  // multiplicateur en ordonnée (×1 → ×4), dans une boîte de 300 × 120.
  const X = (des: number) => (des / CHANCE.floconsPourPlein) * 300;
  const Y = (m: number) => 112 - ((m - 1) / CHANCE.max) * 100;
  const marches = PALIERS_CHANCE.map((p, i) => {
    const suivant = PALIERS_CHANCE[i + 1]?.des ?? CHANCE.floconsPourPlein;
    return `${i === 0 ? 'M' : 'L'}${X(p.des).toFixed(1)} ${Y(p.multiplicateur).toFixed(1)}H${X(suivant).toFixed(1)}`;
  }).join('');
  const REPERES_CHANCE = PALIERS_CHANCE.filter((p) => Number.isInteger(p.multiplicateur));

  // Les paliers de subs, boosters et évènements mêlés, du plus fréquent au plus rare.
  const PALIERS: { every: number; nom: string; texte: string; glyphe: GlyphePalier; teinte: string }[] = [
    ...SUB_MILESTONES.map((m) => {
      const pack = PACKS.find((p) => p.id === m.packId);
      return {
        every: m.every,
        nom: m.label,
        texte: pack
          ? `Ouvert à l’antenne, sa carte tombe sur ${pack.pourQui}.${pack.weights.C === 0 ? ' Rien en dessous de rare.' : ''}`
          : m.description,
        glyphe: 'booster' as const,
        teinte: RARITY_META[GEMME_DU_PACK[m.packId]].color,
      };
    }),
    ...EVENEMENTS_SUBS.map((e) => ({
      every: e.every,
      nom: e.label,
      texte: `${e.resume}, pendant ${dureeLisible(e.dureeMinutes)}, pour tous les joueurs.`,
      glyphe: (e.kind === 'COMMU_ACCELERE' ? 'tempete' : 'flocons') as GlyphePalier,
      teinte: e.kind === 'COMMU_ACCELERE' ? 'var(--ice)' : 'var(--aurora)',
    })),
  ].sort((a, b) => a.every - b.every);

  const ETAPES = [
    {
      titre: 'Connecte-toi avec Twitch',
      texte: 'Ton pseudo Twitch devient ton nom dans la ligue. Pas de mot de passe, rien à créer.',
    },
    {
      titre: 'Donne ton pseudo Activision',
      texte: 'Celui qu’on lit en jeu : c’est lui qu’on reconnaît sur les captures de fin de game.',
    },
    {
      titre: 'Joue tes games',
      texte: 'La modération les saisit d’après le stream. Tes points et tes flocons tombent tout seuls.',
    },
    {
      titre: 'Ouvre, mise, grimpe',
      texte: `Des boosters à l’antenne, des duels entre joueurs, et la finale pour les ${SEASON.finalistCount} premiers.`,
    },
  ];

  return (
    <div className="accueil">
      {/* ---- Le hero, à même le ciel : le nom, l'idée, l'entrée, les quatre
              boosters en éventail dans leur fumée, et les quatre étapes —
              dessous, ou à droite sur un très grand écran. ---- */}
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
            La ligue Warzone de l’hiver, en direct sur Twitch. Tes kills et tes Top 3 te font grimper au classement et
            remplissent ta réserve de flocons. Les subs de la chaîne font tomber des boosters, dont les cartes
            bousculent les games. Et tes flocons, tu les gardes pour mieux tirer, ou tu les mises en duel.
          </p>
          <div className="acc-hero-actions">
            <a href={entree} className="btn btn-twitch btn-lg no-underline">
              <IconTwitch className="h-5 w-5" />
              Rejoindre avec Twitch
            </a>
            <a href="#comment" className="btn btn-lg no-underline">
              Comment ça marche
            </a>
          </div>
          {!twitchEnabled && (
            <p className="acc-hero-note">
              La connexion Twitch ouvre bientôt.
              {devLogin ? ' La connexion de développement reste ouverte en local.' : ''}
            </p>
          )}
          <ul className="acc-chiffres" aria-label="La saison en quatre nombres">
            <li>
              <b>{DEFAULT_MAX_GAMES_PER_PLAYER}</b>
              <span>games par joueur</span>
            </li>
            <li>
              <b>{SEASON.finalistCount}</b>
              <span>places en finale</span>
            </li>
            <li>
              <b>{PACKS.length}</b>
              <span>boosters</span>
            </li>
            <li>
              <b>×{1 + CHANCE.max}</b>
              <span>de chance maximale</span>
            </li>
          </ul>
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

        {/* ---- Comment on entre ---- */}
        <section id="comment" className="glass acc-etapes" aria-labelledby="comment-titre">
          <SnowCap radius="var(--r-lg)" seed="accueil-etapes" epaisseur={18} />
          <div className="acc-etapes-tete">
            <p className="eyebrow">En quatre étapes</p>
            <h2 id="comment-titre" className="titre-glace titre-glace-bloc">
              Comment ça marche
            </h2>
          </div>
          <ol className="acc-etapes-liste">
            {ETAPES.map((e, i) => (
              <li key={e.titre}>
                <span className="acc-etape-n" aria-hidden="true">
                  {i + 1}
                </span>
                <div>
                  <h3>{e.titre}</h3>
                  <p>{e.texte}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      </section>

      <div className="acc-grille">
        {/* ---- Le classement ---- */}
        <Bloc
          id="classement"
          className="acc-classement"
          eyebrow="La ligue"
          titre="Le classement"
          lead={
            <>
              Chaque game compte : tes kills, ton classement de fin de partie, et la carte qui tombe dessus, s’il y en a
              une.
            </>
          }
        >
          <p className="acc-formule">
            <span>score</span> = <b>kills</b> + <b>Top 3</b> + <b>carte</b>
          </p>
          <ul className="acc-podium" aria-label="Les points du classement de fin de partie">
            <li>
              <span className="acc-podium-kill" aria-hidden="true">
                <IconImpact className="h-6 w-6" />
              </span>
              <b>+1</b>
              <span>par kill</span>
            </li>
            <li data-rang="1">
              <CouronneGlace className="acc-podium-icone" id="couronne-accueil" />
              <b>+{PLACEMENT_POINTS['1']}</b>
              <span>Top 1</span>
            </li>
            <li data-rang="2">
              <MedailleGlace rang={2} className="acc-podium-icone" id="medaille-2-accueil" />
              <b>+{PLACEMENT_POINTS['2']}</b>
              <span>Top 2</span>
            </li>
            <li data-rang="3">
              <MedailleGlace rang={3} className="acc-podium-icone" id="medaille-3-accueil" />
              <b>+{PLACEMENT_POINTS['3']}</b>
              <span>Top 3</span>
            </li>
          </ul>
          <div className="acc-finale">
            <ol
              aria-hidden="true"
              style={
                {
                  ['--rangs' as string]: SEASON.finalistCount + 2,
                  ['--finale' as string]: SEASON.finalistCount,
                } as CSSProperties
              }
            >
              {Array.from({ length: SEASON.finalistCount + 2 }, (_, i) => (
                <li key={i} data-qualifie={i < SEASON.finalistCount ? '' : undefined}>
                  {i + 1}
                </li>
              ))}
            </ol>
            <p>
              <b>Les {SEASON.finalistCount} premiers</b> du classement se qualifient pour la finale.
            </p>
          </div>
          <ul className="acc-points">
            <Point titre={`${DEFAULT_MAX_GAMES_PER_PLAYER} games`}>
              comptent pour chaque joueur, sur toute la saison.
            </Point>
            <Point titre="Rien à saisir">
              la modération lit les captures de fin de game, et le serveur calcule le score.
            </Point>
          </ul>
        </Bloc>

        {/* ---- Les flocons ---- */}
        <Bloc
          id="flocons"
          className="acc-flocons"
          eyebrow="La monnaie de la saison"
          titre="Les flocons"
          lead="Ils se gagnent en jouant et ne s’achètent pas. Tout le monde démarre la saison à zéro."
        >
          <ul className="acc-gains">
            <li>
              <b>
                +{ECONOMY.perKill}
                <small>❄</small>
              </b>
              <span>par kill</span>
            </li>
            <li>
              <b>
                +{ECONOMY.perPlacement['1']}
                <small>❄</small>
              </b>
              <span>
                Top 1 · {ECONOMY.perPlacement['2']} le Top 2, {ECONOMY.perPlacement['3']} le Top 3
              </span>
            </li>
            <li>
              <b>Codes</b>
              <span>lâchés par la modération pendant le live</span>
            </li>
          </ul>
          <div className="acc-cadeau">
            <p className="acc-cadeau-titre">
              Le cadeau du jour <span>· dès ta première game</span>
            </p>
            <ol
              role="img"
              aria-label={`${CADEAU_DU_JOUR.parJour} flocons par jour, ${CADEAU_DU_JOUR.septiemeJour} le ${CADEAU_DU_JOUR.cycle}e jour d’affilée`}
            >
              {Array.from({ length: CADEAU_DU_JOUR.cycle }, (_, i) => {
                const septieme = i === CADEAU_DU_JOUR.cycle - 1;
                return (
                  <li
                    key={i}
                    data-septieme={septieme ? '' : undefined}
                    style={{ ['--j' as string]: i } as CSSProperties}
                  >
                    <span>J{i + 1}</span>
                    <b>{septieme ? CADEAU_DU_JOUR.septiemeJour : CADEAU_DU_JOUR.parJour}</b>
                  </li>
                );
              })}
            </ol>
          </div>
          <ul className="acc-points">
            <Point titre="Deux usages">pousser ta chance aux boosters, et miser en duel.</Point>
            <Point titre={`${num(ECONOMY.soldeMax)} ❄ au plus`}>ce qui dépasse le plafond est perdu.</Point>
          </ul>
        </Bloc>

        {/* ---- Les duels ---- */}
        <Bloc
          id="duels"
          className="acc-duels"
          eyebrow="Tes flocons en jeu"
          titre="Les duels"
          lead="Un joueur contre un autre, la même mise des deux côtés. Le gagnant rafle tout."
        >
          <div className="acc-affiche" aria-hidden="true">
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
          <ol className="acc-duel-etapes">
            <Point titre="Tu lances un défi">
              de {num(DUEL.miseMin)} à {num(DUEL.miseMax)} ❄ ; {DUEL.enAttenteMax} en attente au plus.
            </Point>
            <Point titre="Un joueur le relève">
              avec la même mise. D’ici là, tu peux l’annuler : ta mise t’est rendue.
            </Point>
            <Point titre="Une manche">
              chacun pousse sa boule de neige, le premier qui tombe a perdu. Une chance sur deux, tirée par le serveur.
            </Point>
            <Point titre="Tout ou rien">le gagnant rafle les deux mises. Le site ne prend rien au passage.</Point>
          </ol>
        </Bloc>

        {/* ---- Les boosters ---- */}
        <Bloc
          id="boosters"
          className="acc-boosters"
          eyebrow="Une carte par booster"
          titre="Les boosters"
          lead={
            <>
              Quatre boosters, ouverts à l’antenne par la streameuse. Chacun donne une carte qui tombe sur une game : un
              bonus ou un malus, jamais plus de {CARD_IMPACT_CAP} points dans un sens comme dans l’autre.
            </>
          }
        >
          <ul className="acc-packs">
            {PACKS.map((p) => (
              <li key={p.id} className="acc-pack">
                <div className="acc-pack-sachet" aria-hidden="true">
                  <BoosterPack3D
                    name={p.name}
                    cardCount={1}
                    gradient={p.gradient}
                    art={packArt(p.id)}
                    rarete={GEMME_DU_PACK[p.id]}
                    vignette
                  />
                </div>
                <div className="acc-pack-texte">
                  <h3>{p.name}</h3>
                  <p className="acc-pack-quand">{p.declencheur}</p>
                  <p className="acc-pack-qui">Pour {p.pourQui}</p>
                  <div
                    className="acc-taux"
                    role="img"
                    aria-label={ECHELLE.filter((r) => p.weights[r] > 0)
                      .map((r) => `${RARITY_META[r].label} ${pourcent(p.weights, r)}`)
                      .join(', ')}
                  >
                    {ECHELLE.filter((r) => p.weights[r] > 0).map((r) => (
                      <span key={r} data-r={r} style={{ flexGrow: p.weights[r] }} />
                    ))}
                  </div>
                  <p className="acc-pack-legendaire">
                    <EmblemeRarete rarity="L" className="h-5 w-5" />
                    Légendaire <b>{pourcent(p.weights, 'L')}</b>
                  </p>
                </div>
              </li>
            ))}
          </ul>
          <div className="acc-raretes">
            <p className="acc-raretes-titre">Ce qu’une carte peut faire bouger sur une game, au plus</p>
            <ul>
              {ECHELLE.map((r) => (
                <li key={r}>
                  <EmblemeRarete rarity={r} className="acc-raretes-embleme" />
                  <span>{RARITY_META[r].label}</span>
                  <b>{IMPACT_PAR_RARETE[r]} pts</b>
                </li>
              ))}
            </ul>
            <p className="acc-raretes-note">
              Un malus ne sort jamais d’un booster ouvert pour soi ({pourSoi.map((p) => p.name).join(', ')}). Il ne
              touche que la prochaine game de sa cible, et une game ne porte jamais deux cartes.
            </p>
          </div>
        </Bloc>

        {/* ---- La chance ---- */}
        <Bloc
          id="chance"
          className="acc-chance"
          eyebrow="Les multiplicateurs"
          titre="La chance"
          lead={
            <>
              Plus tu as de flocons, plus un booster ouvert pour toi tire haut. Ils ne sont pas dépensés : ils comptent
              tant que tu les gardes.
            </>
          }
        >
          <figure className="acc-escalier">
            <svg viewBox="-34 -6 344 146" role="img" aria-labelledby="escalier-titre">
              <title id="escalier-titre">
                {`Le multiplicateur de chance monte par paliers, de ×1 à 0 flocon jusqu’à ×${1 + CHANCE.max} à ${num(CHANCE.floconsPourPlein)} flocons.`}
              </title>
              <defs>
                <linearGradient id="escalier-aire" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0" style={{ stopColor: 'var(--ice-3)', stopOpacity: 0.35 }} />
                  <stop offset="0.6" style={{ stopColor: 'var(--ice)', stopOpacity: 0.4 }} />
                  <stop offset="1" style={{ stopColor: 'var(--aurora)', stopOpacity: 0.5 }} />
                </linearGradient>
              </defs>
              {[1, 2, 3, 4].map((m) => (
                <g key={m}>
                  <line x1="0" x2="300" y1={Y(m)} y2={Y(m)} className="acc-escalier-grille" />
                  <text x="-8" y={Y(m) + 4} className="acc-escalier-y">
                    ×{m}
                  </text>
                </g>
              ))}
              <path d={`${marches}V112H0Z`} fill="url(#escalier-aire)" />
              <path id="escalier-marches" d={marches} className="acc-escalier-ligne" />
              <circle r="5.5" className="acc-escalier-bille">
                {/* Elle grimpe les paliers, s'attarde au plafond, s'efface et repart. */}
                <animateMotion
                  dur="9s"
                  repeatCount="indefinite"
                  calcMode="linear"
                  keyPoints="0;1;1"
                  keyTimes="0;0.82;1"
                >
                  <mpath href="#escalier-marches" />
                </animateMotion>
                <animate
                  attributeName="opacity"
                  dur="9s"
                  repeatCount="indefinite"
                  values="0;1;1;0"
                  keyTimes="0;0.05;0.92;1"
                />
              </circle>
              {REPERES_CHANCE.map((p) => (
                <text key={p.des} x={X(p.des)} y="132" className="acc-escalier-x">
                  {p.des === 0 ? '0' : `${num(p.des / 1000)} k`}
                </text>
              ))}
            </svg>
            <figcaption>
              {PALIERS_CHANCE.length} paliers de flocons. En jouant toute la saison, on finit vers ×2,5 ou ×3 ; le reste
              se gagne en duel.
            </figcaption>
          </figure>
          <table className="acc-taux-chance">
            <caption>{perso.name} : les chances d’une carte</caption>
            <thead>
              <tr>
                <th scope="col">
                  <span className="sr-only">Rareté</span>
                </th>
                {COLONNES_CHANCE.map((c) => (
                  <th key={c.m} scope="col">
                    ×{c.m}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(['L', 'UR', 'R'] as const).map((r) => (
                <tr key={r}>
                  <th scope="row">
                    <span className="acc-rarete">
                      <EmblemeRarete rarity={r} className="h-5 w-5" />
                      {RARITY_META[r].label}
                    </span>
                  </th>
                  {COLONNES_CHANCE.map((c) => (
                    <td key={c.m}>{pourcent(c.poids, r)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="acc-chance-note">
            Pour les boosters ouverts pour toi : {pourSoi.map((p) => p.name).join(' et ')}.{' '}
            {collectifs.map((p) => p.name.replace('Booster ', '')).join(' et ')} tombent sans chance, pour tout le monde
            pareil.
          </p>
        </Bloc>

        {/* ---- Les subs ---- */}
        <Bloc
          id="subs"
          className="acc-subs"
          eyebrow="Pour toute la ligue"
          titre="Les subs"
          lead="Chaque sub de la saison fait avancer un compteur commun. Ses paliers font tomber des boosters et des évènements, pour tout le monde à la fois."
        >
          <ol className="acc-paliers">
            {PALIERS.map((p) => (
              <li key={`${p.every}-${p.nom}`} style={{ ['--teinte' as string]: p.teinte } as CSSProperties}>
                <EmblemePalier
                  glyphe={p.glyphe}
                  teinte={p.teinte}
                  id={`accueil-${p.every}`}
                  className="acc-palier-embleme"
                />
                <div>
                  <p className="acc-palier-tous">Tous les {p.every} subs</p>
                  <h3>{p.nom}</h3>
                  <p>{p.texte}</p>
                </div>
              </li>
            ))}
          </ol>
          <ul className="acc-points acc-subs-compte">
            <Point titre="Compte">{CE_QUI_COMPTE.join(' · ')}.</Point>
            <Point titre="Ne compte pas">{CE_QUI_NE_COMPTE_PAS.join(' · ')}.</Point>
          </ul>
        </Bloc>
      </div>

      {/* ---- L'entrée ---- */}
      <section className="glass acc-fin" aria-labelledby="fin-titre">
        <SnowCap radius="var(--r-lg)" seed="accueil-fin" epaisseur={20} />
        <div className="acc-fin-texte">
          <p className="eyebrow">{SEASON.edition}</p>
          <h2 id="fin-titre" className="titre-glace titre-glace-bloc">
            {avantLaSaison ? `Coup d’envoi le ${debut}` : `En jeu jusqu’au ${fin}`}
          </h2>
          <p>
            {avantLaSaison
              ? 'Connecte-toi dès maintenant : ton nom t’attend dans la ligue, et tes premières games compteront dès le premier jour.'
              : 'Il reste des games à jouer et des boosters à ouvrir : connecte-toi, et la prochaine capture est pour toi.'}
          </p>
        </div>
        <div className="acc-fin-actions">
          <a href={entree} className="btn btn-twitch btn-lg no-underline">
            <IconTwitch className="h-5 w-5" />
            Rejoindre avec Twitch
          </a>
          <DirectTwitch />
        </div>
      </section>
    </div>
  );
}
