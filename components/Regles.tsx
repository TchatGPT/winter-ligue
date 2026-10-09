import Link from 'next/link';
import type { ReactNode } from 'react';
import { Medaille } from '@/components/EmblemePalier';
import { NAV_ICONS, type NavIconName } from '@/components/icons';
import { ReglesSommaire, type SujetRegles } from '@/components/ReglesSommaire';
import { RarityChip } from '@/components/ui';
import { RARITY_META } from '@/lib/domain/catalog';
import {
  CADEAU_DU_JOUR,
  CHANCE,
  COMMU_ACCELERE_TOUS_LES,
  CRENEAUX_BONUS,
  DUEL,
  ECONOMY,
  EVENEMENTS_SUBS,
  IMPACT_PAR_RARETE,
  PACKS_REGLES,
  PALIERS_CHANCE,
  PLACEMENT_POINTS,
  SEASON,
  SUB_MILESTONES,
  poidsAvecChance,
  rarityPercent,
} from '@/lib/domain/rules';
import { CE_QUI_COMPTE, CE_QUI_NE_COMPTE_PAS } from '@/lib/domain/twitchSubs';
import type { PackDefinition, Rarity } from '@/lib/domain/types';

const RARETES: Rarity[] = ['C', 'R', 'UR', 'L'];

const nombre = (n: number) => n.toLocaleString('fr-FR');
const pourcent = (n: number) => `${n.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`;

/* ------------------------------- Les pièces ------------------------------- */

/** Un encart : un petit titre, puis l'essentiel. */
function Encart({ titre, children }: { titre: string; children: ReactNode }) {
  return (
    <section className="rgs-encart">
      <h3 className="rgs-encart-titre">{titre}</h3>
      {children}
    </section>
  );
}

/** Deux colonnes sur un grand écran : à gauche le concret, à droite les encarts. */
function Duo({ gauche, droite }: { gauche: ReactNode; droite: ReactNode }) {
  return (
    <div className="rgs-duo">
      <div className="rgs-pile">{gauche}</div>
      <div className="rgs-pile">{droite}</div>
    </div>
  );
}

/** Une liste à puces, sobre. */
function Puces({ children }: { children: ReactNode }) {
  return <ul className="rgs-puces">{children}</ul>;
}

/** Une grande tuile de chiffre : la valeur, ce qu'elle paie, et une précision. */
function Tuile({ valeur, nom, detail, ton }: { valeur: ReactNode; nom: string; detail?: ReactNode; ton?: string }) {
  return (
    <div className="rgs-tuile" data-ton={ton}>
      <span className="rgs-tuile-valeur">{valeur}</span>
      <b className="rgs-tuile-nom">{nom}</b>
      {detail && <span className="rgs-tuile-detail">{detail}</span>}
    </div>
  );
}

/** Un exemple chiffré, comme un ticket : chaque ligne, puis le total. */
function Ticket({
  titre,
  lignes,
  total,
}: {
  titre: string;
  lignes: { quoi: ReactNode; vaut: ReactNode }[];
  total: { quoi: ReactNode; vaut: ReactNode };
}) {
  return (
    <section className="rgs-ticket">
      <h3 className="rgs-encart-titre">{titre}</h3>
      <ul>
        {lignes.map((l, i) => (
          <li key={i}>
            <span>{l.quoi}</span>
            <b>{l.vaut}</b>
          </li>
        ))}
      </ul>
      <p className="rgs-ticket-total">
        <span>{total.quoi}</span>
        <b>{total.vaut}</b>
      </p>
    </section>
  );
}

/** Des étapes numérotées, côte à côte ou les unes sous les autres. */
function Etapes({ etapes, vertical = false }: { etapes: { titre: string; texte: ReactNode }[]; vertical?: boolean }) {
  return (
    <ol className="rgs-etapes" data-vertical={vertical ? '' : undefined}>
      {etapes.map((e) => (
        <li key={e.titre}>
          <b>{e.titre}</b>
          <span>{e.texte}</span>
        </li>
      ))}
    </ol>
  );
}

/** Les chances de chaque rareté dans un booster, en une barre et sa légende. */
function Taux({ weights }: { weights: Record<Rarity, number> }) {
  const presentes = RARETES.filter((r) => weights[r] > 0);
  return (
    <div className="rgs-taux">
      <div className="rgs-taux-barre" aria-hidden="true">
        {presentes.map((r) => (
          <span key={r} style={{ width: `${rarityPercent(weights, r)}%`, background: RARITY_META[r].color }} />
        ))}
      </div>
      <p className="rgs-taux-legende">
        {presentes.map((r) => (
          <span key={r}>
            <i style={{ background: RARITY_META[r].color }} aria-hidden="true" />
            {RARITY_META[r].short} {pourcent(rarityPercent(weights, r))}
          </span>
        ))}
      </p>
    </div>
  );
}

/**
 * Les règles de la saison, en sept sujets : les points, les boosters, les
 * cartes, les flocons, la chance, les duels et les subs. Chacun se résume en
 * une ligne dans le sommaire ; sa page montre d'abord le concret (une
 * addition, des tuiles, des étapes), puis l'explique en quelques encarts.
 *
 * Tous les nombres sont lus dans `lib/domain/rules`, `catalog` et les boosters
 * tels que la ligue les règle (`resolvedPacks`) : la page dit exactement ce
 * que le serveur applique.
 */
export function Regles({ maxGames, packs }: { maxGames: number; packs: PackDefinition[] }) {
  const pack = (id: string) => packs.find((p) => p.id === id);
  const palier = (id: 'commu' | 'folie') => SUB_MILESTONES.find((m) => m.packId === id)?.every;
  const avalanche = EVENEMENTS_SUBS.find((e) => e.kind === 'FLOCONS_DOUBLES');
  const tempete = EVENEMENTS_SUBS.find((e) => e.kind === 'COMMU_ACCELERE');
  const chanceMax = PALIERS_CHANCE.at(-1)!.multiplicateur;
  const carteMax = Math.max(...RARETES.map((r) => IMPACT_PAR_RARETE[r]));

  // L'exemple de la chance : la légendaire du Booster Perso, sans et avec.
  const perso = pack('perso');
  const uneSur = (w: Record<Rarity, number>) => (w.L > 0 ? Math.round(100_000 / w.L) : null);
  const legendaireSans = perso ? uneSur(perso.weights) : null;
  const legendaireAvec = perso ? uneSur(poidsAvecChance(perso.weights, CHANCE.max)) : null;

  const boosters: { id: string; quand: string; pourToi: boolean }[] = [
    { id: 'perso', quand: `1 sub T3, ou ${PACKS_REGLES.persoTousLes} subs offerts`, pourToi: true },
    { id: 'finisseur', quand: 'Ta dernière game de la saison', pourToi: true },
    { id: 'commu', quand: `Tous les ${palier('commu')} subs de la chaîne`, pourToi: false },
    { id: 'folie', quand: `Tous les ${palier('folie')} subs de la chaîne`, pourToi: false },
  ];

  const paliersSubs = [
    ...SUB_MILESTONES.map((m) => ({ every: m.every, nom: m.label, effet: 'un booster à ouvrir en live' })),
    ...EVENEMENTS_SUBS.map((e) => ({ every: e.every, nom: e.label, effet: e.resume })),
  ].sort((a, b) => a.every - b.every);

  const sujet = (
    id: string,
    titre: string,
    resume: string,
    icone: NavIconName,
    teinte: string,
    contenu: ReactNode,
  ): SujetRegles => {
    const Icone = NAV_ICONS[icone];
    return {
      id,
      titre,
      resume,
      medaille: (
        <Medaille teinte={teinte} id={`rg-nav-${id}`} className="rgs-medaille">
          <Icone className="medaille-icone" />
        </Medaille>
      ),
      medailleGrande: (
        <Medaille teinte={teinte} id={`rg-page-${id}`} className="rgs-medaille-grande">
          <Icone className="medaille-icone" />
        </Medaille>
      ),
      contenu,
    };
  };

  const sujets: SujetRegles[] = [
    /* ------------------------------ Les points ------------------------------ */
    sujet(
      'points',
      'Les points',
      'Tes kills, ton classement et ta carte font le score de chaque game.',
      'trophy',
      'var(--gold)',
      <>
        <div className="rgs-formule" aria-label="Le score d’une game">
          <Tuile valeur="1 pt" nom="Par kill" />
          <i aria-hidden="true">+</i>
          <Tuile
            valeur={`+${PLACEMENT_POINTS['1']}`}
            nom="Top 1"
            detail={`Top 2 +${PLACEMENT_POINTS['2']} · Top 3 +${PLACEMENT_POINTS['3']}`}
          />
          <i aria-hidden="true">+</i>
          <Tuile valeur={`±${carteMax}`} nom="Ta carte, au plus" detail="un bonus ou un malus" />
          <i aria-hidden="true">=</i>
          <Tuile valeur="Score" nom="de la game" ton="or" />
        </div>
        <Duo
          gauche={
            <Ticket
              titre="Un exemple"
              lignes={[
                { quoi: '7 kills', vaut: '7 pts' },
                { quoi: 'Top 2', vaut: `+${PLACEMENT_POINTS['2']} pts` },
                { quoi: 'Une carte bonus', vaut: '+10 pts' },
              ]}
              total={{ quoi: 'Ta game', vaut: `${7 + PLACEMENT_POINTS['2'] + 10} pts` }}
            />
          }
          droite={
            <>
              <Encart titre="La saison">
                <Puces>
                  <li>
                    <b>{maxGames} games</b> comptent par joueur ; la dernière t’ouvre le Booster Finisseur.
                  </li>
                  <li>La carte « Game supplémentaire » en ajoute une, {CRENEAUX_BONUS.max} au plus.</li>
                </Puces>
              </Encart>
              <Encart titre="Le classement">
                <Puces>
                  <li>
                    Il additionne toutes tes games. Les <b>{SEASON.finalistCount} premiers</b> vont en finale.
                  </li>
                  <li>À égalité : le plus de Top 1, puis de kills, puis la meilleure game.</li>
                </Puces>
              </Encart>
              <Encart titre="Qui saisit les games">
                <p>La modération, d’après le stream. Le score est calculé par le serveur : personne ne l’impose.</p>
              </Encart>
            </>
          }
        />
      </>,
    ),

    /* ------------------------------ Les boosters ------------------------------ */
    sujet(
      'boosters',
      'Les boosters',
      'Une carte dans chacun, ouverts en live par Lriaa ou la modération.',
      'pack',
      'var(--ice)',
      <>
        <div className="rgs-boosters">
          {boosters.map((b) => {
            const p = pack(b.id);
            if (!p) return null;
            return (
              <article key={b.id} className="rgs-booster" data-pour={b.pourToi ? 'toi' : 'sort'}>
                <header>
                  <span className="rgs-booster-glyphe" aria-hidden="true">
                    {p.glyph}
                  </span>
                  <h3>{p.name}</h3>
                  <em>{b.pourToi ? 'pour toi' : 'au sort'}</em>
                </header>
                <p>{b.quand}</p>
                <Taux weights={p.weights} />
              </article>
            );
          })}
        </div>
        <Duo
          gauche={
            <Encart titre="Comment ça se passe">
              <Etapes
                vertical
                etapes={[
                  { titre: 'Il arrive dans la file', texte: 'Dès que tu le gagnes, ou qu’un palier de subs tombe.' },
                  { titre: 'Il s’ouvre en live', texte: 'Lriaa ou la modération l’ouvre, un par un, à l’écran.' },
                  {
                    titre: 'Le serveur tire la carte',
                    texte: 'Et, pour un booster de la ligue, le joueur qui la reçoit. Personne ne choisit.',
                  },
                  { titre: 'La carte joue', texte: 'Le plus souvent sur ta prochaine game.' },
                ]}
              />
            </Encart>
          }
          droite={
            <>
              <Encart titre="Rien n’est truqué">
                <p>
                  La carte est tirée <b>par le serveur</b>, au hasard, aux taux affichés sur la page Boosters, avant
                  même l’animation. <b>Ni Lriaa ni la modération ne choisissent</b> la carte, ni le joueur sur qui elle
                  tombe. Chaque ouverture est inscrite au journal.
                </p>
              </Encart>
              <Encart titre="Pour toi, ou au sort">
                <p>
                  <b>Perso</b> et <b>Finisseur</b> s’ouvrent pour toi, et ne contiennent que des bonus. <b>Commu</b> et{' '}
                  <b>Folie</b> sont ceux de la ligue : leur carte tombe sur des joueurs tirés au sort.
                </p>
              </Encart>
              <Encart titre="Bon à savoir">
                <Puces>
                  <li>Plus tu as de flocons, plus ton Perso et ton Finisseur sortent rare : voir « La chance ».</li>
                  <li>La modération peut offrir un Booster Perso à un autre joueur.</li>
                  {tempete && (
                    <li>
                      Pendant la {tempete.label}, le Booster Commu tombe tous les {COMMU_ACCELERE_TOUS_LES} subs.
                    </li>
                  )}
                </Puces>
              </Encart>
            </>
          }
        />
      </>,
    ),

    /* ------------------------------ Les cartes ------------------------------ */
    sujet(
      'cartes',
      'Les cartes',
      'Un bonus ou un malus, sur une seule game, puis elle disparaît.',
      'layers',
      'var(--violet)',
      <>
        <ul className="rgs-raretes" aria-label="Ce qu’une carte fait bouger au plus, selon sa rareté">
          {RARETES.map((r) => (
            <li key={r} style={{ ['--teinte' as string]: RARITY_META[r].color }}>
              <RarityChip rarity={r} />
              <b>{IMPACT_PAR_RARETE[r]} pts</b>
              <span>{RARITY_META[r].label}</span>
            </li>
          ))}
        </ul>
        <p className="rgs-sous-note">Au plus, ce qu’une carte fait gagner ou perdre sur une game, selon sa rareté.</p>
        <Duo
          gauche={
            <Encart titre="Quand elle se joue">
              <Etapes
                vertical
                etapes={[
                  { titre: 'Sur ta prochaine game', texte: 'Le plus souvent. Une seule carte par game.' },
                  {
                    titre: 'Sur une game déjà jouée',
                    texte: '« Pire game ×2 », « Meilleure game ×1,5 »…',
                  },
                  { titre: 'Tout de suite', texte: 'Les flocons, la game supplémentaire, l’immunité.' },
                ]}
              />
            </Encart>
          }
          droite={
            <>
              <Encart titre="Les malus">
                <Puces>
                  <li>Jamais dans un booster ouvert pour toi.</li>
                  <li>Ils tombent sur un joueur tiré au sort, ou sur la tête du classement.</li>
                  <li>Ils retirent des points, et n’en donnent à personne.</li>
                </Puces>
              </Encart>
              <Encart titre="L’immunité">
                <p>Tant qu’elle court, elle pare tout malus qui tombe sur une de tes games. Les bonus passent.</p>
              </Encart>
              <Link href="/boosters" className="rgs-lien">
                Voir toutes les cartes →
              </Link>
            </>
          }
        />
      </>,
    ),

    /* ------------------------------ Les flocons ------------------------------ */
    sujet(
      'flocons',
      'Les flocons',
      'La monnaie de la ligue : on la gagne en jouant, on la mise en duel.',
      'snowflake',
      'var(--aurora)',
      <>
        <div className="rgs-gains" aria-label="Comment gagner des flocons">
          <Tuile valeur={`${ECONOMY.perKill} ❄`} nom="Par kill" ton="aurore" />
          <Tuile valeur={`${nombre(ECONOMY.perPlacement['1'])} ❄`} nom="Top 1" ton="aurore" />
          <Tuile valeur={`${nombre(ECONOMY.perPlacement['2'])} ❄`} nom="Top 2" ton="aurore" />
          <Tuile valeur={`${nombre(ECONOMY.perPlacement['3'])} ❄`} nom="Top 3" ton="aurore" />
          <Tuile
            valeur={`${CADEAU_DU_JOUR.parJour} ❄`}
            nom="Cadeau du jour"
            detail={`${CADEAU_DU_JOUR.septiemeJour} ❄ le ${CADEAU_DU_JOUR.cycle}e jour`}
            ton="aurore"
          />
          <Tuile valeur="Codes" nom="Pendant le live" detail="à taper sur le site" ton="aurore" />
        </div>
        <Duo
          gauche={
            <Encart titre="À quoi ils servent">
              <div className="rgs-choix">
                <Link href="/duels" className="no-underline">
                  <b>Miser en duel</b>
                  <span>Le gagnant prend les deux mises.</span>
                </Link>
                <a href="#regle-chance" className="no-underline">
                  <b>Augmenter ta chance</b>
                  <span>Tes boosters sortent plus rare. Rien n’est dépensé.</span>
                </a>
              </div>
              <p className="rgs-sous-note">Rien d’autre ne s’achète : ni carte, ni booster.</p>
            </Encart>
          }
          droite={
            <Encart titre="Bon à savoir">
              <Puces>
                <li>Tout le monde commence la saison à 0 ❄.</li>
                <li>
                  Le solde plafonne à <b>{nombre(ECONOMY.soldeMax)} ❄</b> : au-delà, c’est perdu.
                </li>
                {avalanche && (
                  <li>
                    Tous les {avalanche.every} subs, l’<b>{avalanche.label}</b> double les flocons des games pendant 1
                    h.
                  </li>
                )}
              </Puces>
            </Encart>
          }
        />
      </>,
    ),

    /* ------------------------------ La chance ------------------------------ */
    sujet(
      'chance',
      'La chance',
      'Plus tu as de flocons, plus tes boosters sortent de cartes rares.',
      'rocket',
      'var(--gold)',
      <>
        <div className="rgs-marches" role="img" aria-label="Le multiplicateur de chance selon ton solde de flocons">
          {PALIERS_CHANCE.map((p) => (
            <div key={p.des} style={{ ['--h' as string]: `${(p.multiplicateur / chanceMax) * 100}%` }}>
              <b>×{p.multiplicateur.toLocaleString('fr-FR')}</b>
              <span aria-hidden="true" />
              <small>{p.des >= 1000 ? `${nombre(p.des / 1000)}k` : p.des}</small>
            </div>
          ))}
        </div>
        <p className="rgs-sous-note">Ton multiplicateur selon ton solde de flocons (en milliers).</p>
        <Duo
          gauche={
            legendaireSans && legendaireAvec ? (
              <Ticket
                titre="Un exemple : une légendaire du Booster Perso"
                lignes={[
                  { quoi: 'À 0 ❄ (×1)', vaut: `1 sur ${nombre(legendaireSans)}` },
                  { quoi: `À ${nombre(ECONOMY.soldeMax)} ❄ (×${chanceMax})`, vaut: `1 sur ${nombre(legendaireAvec)}` },
                ]}
                total={{ quoi: 'Soit', vaut: `${chanceMax} fois plus souvent` }}
              />
            ) : (
              <Encart titre="Ce que ça change">
                <p>Les cartes rares sortent jusqu’à {chanceMax} fois plus souvent.</p>
              </Encart>
            )
          }
          droite={
            <Encart titre="Quand elle compte">
              <Puces>
                <li>
                  Pour les boosters ouverts <b>pour toi</b> : Perso et Finisseur.
                </li>
                <li>Jamais pour Commu et Folie : là, tout le monde est à égalité.</li>
                <li>Tes flocons ne sont pas dépensés : il suffit de les avoir.</li>
                <li>
                  Elle rend les cartes rares plus probables, jamais certaines : le tirage reste aléatoire, et c’est le
                  serveur qui le fait.
                </li>
              </Puces>
            </Encart>
          }
        />
      </>,
    ),

    /* ------------------------------ Les duels ------------------------------ */
    sujet(
      'duels',
      'Les duels',
      'Même mise des deux côtés, une chance sur deux, le gagnant rafle tout.',
      'swords',
      'var(--danger)',
      <>
        <Etapes
          etapes={[
            {
              titre: 'Tu lances un défi',
              texte: `Avec ta mise, de ${nombre(DUEL.miseMin)} à ${nombre(DUEL.miseMax)} ❄.`,
            },
            { titre: 'Un joueur le relève', texte: 'Avec la même mise que toi.' },
            { titre: 'La course', texte: 'Le serveur tire le vainqueur : une chance sur deux chacun.' },
            { titre: 'Le gagnant rafle tout', texte: 'Les deux mises. Le perdant perd la sienne.' },
          ]}
        />
        <Duo
          gauche={
            <Ticket
              titre="Un exemple"
              lignes={[
                { quoi: 'Ta mise', vaut: '1 000 ❄' },
                { quoi: 'La mise de ton adversaire', vaut: '1 000 ❄' },
              ]}
              total={{ quoi: 'Le gagnant repart avec', vaut: '2 000 ❄' }}
            />
          }
          droite={
            <Encart titre="Bon à savoir">
              <Puces>
                <li>Tant que personne n’a relevé ton défi, tu peux l’annuler : ta mise t’est rendue.</li>
                <li>Aucune carte n’entre en jeu dans un duel.</li>
                <li>Un duel joué pendant ton absence t’est annoncé à ton retour.</li>
              </Puces>
              <Link href="/duels" className="rgs-lien">
                Lancer un duel →
              </Link>
            </Encart>
          }
        />
      </>,
    ),

    /* ------------------------------ Les subs ------------------------------ */
    sujet(
      'subs',
      'Les subs',
      'Chaque sub de la chaîne fait tomber des boosters et des évènements pour tous.',
      'antenne',
      'var(--violet)',
      <>
        <ul className="rgs-paliers" aria-label="Ce que les subs font tomber">
          {paliersSubs.map((p) => (
            <li key={`${p.every}-${p.nom}`}>
              <span className="rgs-paliers-nombre">
                <small>tous les</small>
                <b>{p.every}</b>
                <small>subs</small>
              </span>
              <span className="rgs-paliers-effet">
                <strong>{p.nom}</strong>
                {p.effet}
              </span>
            </li>
          ))}
        </ul>
        <p className="rgs-sous-note">
          Ces paliers comptent les subs de toute la saison, et profitent à tous les joueurs.
        </p>
        <Duo
          gauche={
            <Encart titre="Ce qui compte">
              <div className="rgs-compte">
                <ul data-oui="">
                  {CE_QUI_COMPTE.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
                <ul>
                  {CE_QUI_NE_COMPTE_PAS.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
              </div>
            </Encart>
          }
          droite={
            <Encart titre="Le Booster Perso">
              <p>
                <b>1 sub T3</b>, ou <b>{PACKS_REGLES.persoTousLes} subs offerts</b> au fil de la saison : un Booster
                Perso pour qui paie. S’il ne joue pas dans la ligue, la modération le donne à un joueur.
              </p>
            </Encart>
          }
        />
      </>,
    ),
  ];

  return <ReglesSommaire sujets={sujets} />;
}
