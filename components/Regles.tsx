import Link from 'next/link';
import type { ReactNode } from 'react';
import { Medaille } from '@/components/EmblemePalier';
import {
  IconAntenne,
  IconCadeau,
  IconImpact,
  IconLayers,
  IconPack,
  IconShield,
  IconSnowflake,
  IconSwords,
  IconTrophy,
  IconUser,
  NAV_ICONS,
  type NavIconName,
} from '@/components/icons';
import { ReglesSommaire, type SujetRegles } from '@/components/ReglesSommaire';
import { RarityChip } from '@/components/ui';
import { CARDS, packArt, RARITY_META } from '@/lib/domain/catalog';
import {
  ACHAT_PERSO,
  CADEAU_DU_JOUR,
  CHANCE,
  COMMU_ACCELERE_TOUS_LES,
  CRENEAUX_BONUS,
  DUEL,
  ECONOMY,
  EVENEMENTS_SUBS,
  JOKERS,
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

/**
 * Des encarts côte à côte, de même hauteur : autant de colonnes qu'il y en a,
 * dès que la page a la place ; empilés sinon. Il n'y a plus de colonne courte
 * qui laisse un trou sous elle.
 */
function Grille({ children }: { children: ReactNode }) {
  return <div className="rgs-grille">{children}</div>;
}

/** Quelques faits courts, en pastilles sur une ligne. */
function Faits({ children }: { children: ReactNode }) {
  return <ul className="rgs-faits">{children}</ul>;
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

/**
 * Des étapes en frise, comme « Comment ça marche » des boosters : l'icône dans
 * un rond numéroté, un trait jusqu'à la suivante, le titre et une phrase. À la
 * verticale quand la page est étroite.
 */
function Frise({ etapes }: { etapes: { icone: ReactNode; titre: string; texte: ReactNode }[] }) {
  return (
    <ol className="frise rgs-frise" style={{ ['--colonnes' as string]: etapes.length }}>
      {etapes.map((e, i) => (
        <li key={e.titre} className="frise-etape">
          <div className="frise-rail" aria-hidden="true">
            <span className="frise-rond rgs-frise-rond">
              {e.icone}
              <span className="frise-numero">{i + 1}</span>
            </span>
            <span className="frise-trait" />
          </div>
          <div className="frise-corps">
            <p className="frise-titre">
              <span className="sr-only">Étape {i + 1} : </span>
              {e.titre}
            </p>
            <p className="frise-texte">{e.texte}</p>
          </div>
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
 * une ligne dans le sommaire ; sa page va droit au but (refaite le 03/11/2026) :
 * le concret d'abord — une addition, les boosters, des tuiles, une frise —,
 * puis deux ou trois encarts de même hauteur, ou quelques faits en pastilles.
 *
 * Tous les nombres sont lus dans `lib/domain/rules`, `catalog` et les boosters
 * tels que la ligue les règle (`resolvedPacks`) : la page dit exactement ce
 * que le serveur applique.
 */
export function Regles({ maxGames, packs }: { maxGames: number; packs: PackDefinition[] }) {
  const pack = (id: string) => packs.find((p) => p.id === id);
  const palier = (id: 'commu' | 'folie') => SUB_MILESTONES.find((m) => m.packId === id)?.every;
  const avalanche = EVENEMENTS_SUBS.find((e) => e.kind === 'FLOCONS_A_TOUS');
  const tempete = EVENEMENTS_SUBS.find((e) => e.kind === 'COMMU_ACCELERE');
  const chanceMax = PALIERS_CHANCE.at(-1)!.multiplicateur;

  // Ce que la chance change au Booster Perso : ses taux à trois soldes — rien,
  // le palier ×2, le plafond.
  const perso = pack('perso');
  const uneSur = (w: Record<Rarity, number>) => (w.L > 0 ? Math.round(100_000 / w.L) : null);
  const palierDouble = PALIERS_CHANCE.find((p) => p.multiplicateur === 2);
  const exemplesChance = perso
    ? [PALIERS_CHANCE[0], palierDouble, PALIERS_CHANCE.at(-1)!]
        .filter((p): p is { des: number; multiplicateur: number } => p !== undefined)
        .map((p) => ({ ...p, weights: poidsAvecChance(perso.weights, Math.min(CHANCE.max, p.multiplicateur - 1)) }))
    : [];

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
          <Tuile valeur="+ / −" nom="Ta carte" detail="un bonus ou un malus" />
          <i aria-hidden="true">=</i>
          <Tuile valeur="Score" nom="de la game" ton="or" />
        </div>
        <Grille>
          <Ticket
            titre="Un exemple"
            lignes={[
              { quoi: '7 kills', vaut: '7 pts' },
              { quoi: 'Top 2', vaut: `+${PLACEMENT_POINTS['2']} pts` },
              { quoi: 'Une carte bonus', vaut: '+10 pts' },
            ]}
            total={{ quoi: 'Ta game', vaut: `${7 + PLACEMENT_POINTS['2'] + 10} pts` }}
          />
          <Encart titre="La saison">
            <Puces>
              <li>
                <b>{maxGames} games</b> par joueur.
              </li>
              <li>« Game supplémentaire » en ajoute une, {CRENEAUX_BONUS.max} au plus.</li>
              <li>Top 6, 8 et 10 ne rapportent rien seuls : ils servent aux cartes.</li>
            </Puces>
          </Encart>
          <Encart titre="Le classement">
            <Puces>
              <li>
                Toutes tes games additionnées. Les <b>{SEASON.finalistCount} premiers</b> vont en finale.
              </li>
              <li>À égalité : le plus de Top 1, puis de kills, puis la meilleure game.</li>
              <li>Saisi par la modération, calculé par le serveur.</li>
            </Puces>
          </Encart>
        </Grille>
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
            const art = packArt(p.id);
            return (
              <article key={b.id} className="rgs-booster" data-pour={b.pourToi ? 'toi' : 'sort'}>
                {art ? (
                  // eslint-disable-next-line @next/next/no-img-element -- une planche déjà dimensionnée
                  <img className="rgs-booster-art" src={art} alt="" width={120} height={224} />
                ) : (
                  <span className="rgs-booster-glyphe" aria-hidden="true">
                    {p.glyph}
                  </span>
                )}
                <div className="rgs-booster-corps">
                  <header>
                    <h3>{p.name}</h3>
                    <em>{b.pourToi ? 'pour toi' : 'pour la ligue'}</em>
                  </header>
                  <p>{b.quand}</p>
                  <Taux weights={p.weights} />
                </div>
              </article>
            );
          })}
        </div>
        <Frise
          etapes={[
            { icone: <IconPack className="h-5 w-5" />, titre: 'Il arrive', texte: 'Dans la file, dès qu’il t’est dû.' },
            {
              icone: <IconAntenne className="h-5 w-5" />,
              titre: 'Il s’ouvre en live',
              texte: 'Par Lriaa ou la modération.',
            },
            {
              icone: <IconShield className="h-5 w-5" />,
              titre: 'Le serveur tire',
              texte: 'La carte, et le joueur pour Commu et Folie. Personne ne choisit.',
            },
            { icone: <IconLayers className="h-5 w-5" />, titre: 'La carte joue', texte: 'Son effet est écrit dessus.' },
          ]}
        />
        <Faits>
          <li>
            <b>Pour toi</b> : Perso et Finisseur — tes flocons y montent ta chance.
          </li>
          <li>
            <b>Pour la ligue</b> : Commu et Folie — le sort désigne qui.
          </li>
          {tempete && (
            <li>
              <b>{tempete.label}</b> : un Commu tous les {COMMU_ACCELERE_TOUS_LES} subs.
            </li>
          )}
        </Faits>
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
        <ul className="rgs-raretes" aria-label="Les cartes de chaque rareté">
          {RARETES.map((r) => {
            const n = CARDS.filter((c) => c.rarity === r).length;
            return (
              <li key={r} style={{ ['--teinte' as string]: RARITY_META[r].color }}>
                <RarityChip rarity={r} />
                <b>
                  {n} carte{n > 1 ? 's' : ''}
                </b>
                <span>{RARITY_META[r].label}</span>
              </li>
            );
          })}
        </ul>
        <p className="rgs-sous-note">Plus une carte est rare, plus elle est forte.</p>
        <Frise
          etapes={[
            {
              icone: <IconSwords className="h-5 w-5" />,
              titre: 'Sur ta prochaine game',
              texte: 'Le plus souvent : elle s’y applique, puis disparaît.',
            },
            {
              icone: <IconImpact className="h-5 w-5" />,
              titre: 'Tout de suite',
              texte: 'Des flocons, des points bonus, une action sur la ligue.',
            },
            {
              icone: <IconCadeau className="h-5 w-5" />,
              titre: 'Gardée',
              texte: `Le Joker, le Verglas : tu choisis quand. ${JOKERS.depart} Jokers pour commencer.`,
            },
          ]}
        />
        <Grille>
          <Encart titre="Une à la fois">
            <p>Une seule carte en attente : ton booster suivant s’ouvre quand elle a joué.</p>
          </Encart>
          <Encart titre="Les malus">
            <p>Jamais contre toi dans ton Perso ou ton Finisseur. Ceux de la ligue tombent au sort.</p>
          </Encart>
          <Encart titre="L’immunité">
            <p>Tant qu’elle court, les malus te passent à côté. Les bonus, eux, passent.</p>
          </Encart>
        </Grille>
        <Link href="/boosters" className="rgs-lien">
          Voir toutes les cartes →
        </Link>
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
            detail={`un Booster Perso le ${CADEAU_DU_JOUR.cycle}e jour`}
            ton="aurore"
          />
          <Tuile valeur="Codes" nom="Pendant le live" detail="à taper sur le site" ton="aurore" />
        </div>
        <section className="rgs-usages" aria-label="À quoi ils servent">
          <Link href="/duels" className="rgs-usage no-underline">
            <b>Miser en duel</b>
            <span>Le gagnant rafle les deux mises.</span>
          </Link>
          <a href="#regle-chance" className="rgs-usage no-underline">
            <b>Monter ta chance</b>
            <span>Plus tu en as, plus tu tires rare. Rien n’est dépensé.</span>
          </a>
          <div className="rgs-usage">
            <b>Un Booster Perso</b>
            <span>
              {nombre(ACHAT_PERSO.prix)} ❄, en touchant ton solde. Ta chance baisse avec.
            </span>
          </div>
        </section>
        <Faits>
          <li>
            Départ à <b>0 ❄</b>
          </li>
          <li>
            Plafond <b>{nombre(ECONOMY.soldeMax)} ❄</b> : au-delà, perdu
          </li>
          {avalanche && (
            <li>
              <b>{avalanche.label}</b> : +{avalanche.flocons} ❄ à tous, tous les {avalanche.every} subs
            </li>
          )}
        </Faits>
      </>,
    ),

    /* ------------------------------ La chance ------------------------------ */
    sujet(
      'chance',
      'La chance',
      'Plus tu as de flocons, plus tu as de chances de tirer une carte rare — jamais à coup sûr.',
      'rocket',
      'var(--gold)',
      <>
        {/* Les paliers : un multiplicateur par seuil de solde, de la glace à l'or
            à mesure qu'il monte. Le dernier, plein, est cerclé d'or. */}
        <section className="rgs-encart" aria-labelledby="chance-paliers">
          <h3 id="chance-paliers" className="rgs-encart-titre">
            Ton multiplicateur, selon ton solde
          </h3>
          <ol
            className="rgs-chance-paliers"
            style={{
              ['--n' as string]: PALIERS_CHANCE.length,
              ['--demi' as string]: Math.ceil(PALIERS_CHANCE.length / 2),
            }}
          >
            {PALIERS_CHANCE.map((p) => (
              <li
                key={p.des}
                style={{ ['--t' as string]: (p.multiplicateur - 1) / (chanceMax - 1) }}
                data-plein={p.multiplicateur === chanceMax ? '' : undefined}
              >
                <b>×{p.multiplicateur.toLocaleString('fr-FR')}</b>
                <span>{p.des === 0 ? 'dès 0 ❄' : `dès ${nombre(p.des)} ❄`}</span>
              </li>
            ))}
          </ol>
        </section>

        {/* Ce que ça change, pour de vrai : les taux du Booster Perso à trois soldes. */}
        {exemplesChance.length > 0 && (
          <section className="rgs-encart" aria-labelledby="chance-exemple">
            <h3 id="chance-exemple" className="rgs-encart-titre">
              Ce que ça change : le Booster Perso
            </h3>
            <div className="rgs-chances">
              {exemplesChance.map((e, i) => (
                <div key={e.des} className="rgs-chance" data-plein={i === exemplesChance.length - 1 ? '' : undefined}>
                  <p className="rgs-chance-tete">
                    <b>×{e.multiplicateur.toLocaleString('fr-FR')}</b>
                    <span>{e.des === 0 ? 'Sans flocons' : `À ${nombre(e.des)} ❄`}</span>
                  </p>
                  <ul>
                    {RARETES.map((r) => (
                      <li key={r}>
                        <RarityChip rarity={r} taille={16} />
                        <span className="rgs-chance-nom">{RARITY_META[r].label}</span>
                        <b>{pourcent(rarityPercent(e.weights, r))}</b>
                      </li>
                    ))}
                  </ul>
                  {uneSur(e.weights) && (
                    <p className="rgs-chance-pied">
                      Une légendaire sur <b>{nombre(uneSur(e.weights)!)}</b>
                    </p>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        <Faits>
          <li>
            Pour <b>Perso et Finisseur</b> seulement
          </li>
          <li>
            Il suffit de <b>les avoir</b> : rien n’est dépensé
          </li>
          <li>
            Plus probable, <b>jamais certain</b>
          </li>
        </Faits>
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
        <Frise
          etapes={[
            {
              icone: <IconSnowflake className="h-5 w-5" />,
              titre: 'Tu lances un défi',
              texte: `${DUEL.mises.slice(0, -1).map(nombre).join(', ')} ou ${nombre(DUEL.miseMax)} ❄.`,
            },
            { icone: <IconUser className="h-5 w-5" />, titre: 'Un joueur le relève', texte: 'Avec la même mise.' },
            {
              icone: <IconSwords className="h-5 w-5" />,
              titre: 'La course',
              texte: 'En direct, une chance sur deux.',
            },
            {
              icone: <IconTrophy className="h-5 w-5" />,
              titre: 'Le gagnant rafle tout',
              texte: 'Les deux mises.',
            },
          ]}
        />
        <Grille>
          <Ticket
            titre="Un exemple"
            lignes={[
              { quoi: 'Ta mise', vaut: '1 000 ❄' },
              { quoi: 'Sa mise', vaut: '1 000 ❄' },
            ]}
            total={{ quoi: 'Le gagnant repart avec', vaut: '2 000 ❄' }}
          />
          <Encart titre="Bon à savoir">
            <Puces>
              <li>Pas encore relevé ? Tu l’annules, ta mise revient.</li>
              <li>Aucune carte n’entre en jeu.</li>
              <li>Joué en ton absence : annoncé à ton retour.</li>
            </Puces>
            <Link href="/duels" className="rgs-lien">
              Lancer un duel →
            </Link>
          </Encart>
        </Grille>
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
        <p className="rgs-sous-note">Comptés sur toute la saison, pour tous les joueurs.</p>
        <Grille>
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
          <Encart titre="Le Booster Perso">
            <p>
              <b>1 sub T3</b> ou <b>{PACKS_REGLES.persoTousLes} subs offerts</b> : un Booster Perso pour qui paie. S’il ne
              joue pas, la modération le donne à un joueur.
            </p>
          </Encart>
        </Grille>
      </>,
    ),
  ];

  return <ReglesSommaire sujets={sujets} />;
}
