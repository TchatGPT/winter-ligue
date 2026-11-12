'use client';

import Link from 'next/link';
import { type ReactNode, useMemo, useState } from 'react';
import { CardFrame } from '@/components/CardFrame';
import { CorrectionGame, type GameACorriger } from '@/components/CorrectionGame';
import { CouronneGlace } from '@/components/CouronneGlace';
import { MedailleGlace } from '@/components/MedailleGlace';
import { ColonnesSaison, TableauGames } from '@/components/SaisonDuJoueur';
import { SnowCap } from '@/components/SnowCap';
import { flakes } from '@/components/ui';
import { getPack } from '@/lib/domain/catalog';
import { CHANCE, ECONOMY, libelleMultiplicateur, PACKS_REGLES } from '@/lib/domain/rules';
import type { BilanSubs } from '@/lib/domain/twitchSubs';
import { decimal, shortDateTime } from '@/lib/format';
import type { FicheJoueur as DonneesFiche } from '@/lib/services/profile';

/** « 1er », « 2e », « 3e »… */
const ordinal = (n: number) => (n === 1 ? '1er' : `${n}e`);

const signe = (n: number) => (n > 0 ? `+${flakes(n)}` : n < 0 ? `−${flakes(-n)}` : '0');

/** Les games montrées d'emblée dans le tableau ; la suite se déplie. */
const GAMES_VISIBLES = 20;

type Onglet = 'games' | 'duels' | 'flocons' | 'subs';
type Filtre = 'toutes' | 'top3' | 'carte';
type Tri = 'recentes' | 'meilleures';

/** La couronne, une médaille, ou le rang dans un disque de glace. */
function Rang({ position, id, className }: { position: number; id: string; className: string }) {
  if (position === 1) return <CouronneGlace className={className} id={`couronne-${id}`} />;
  if (position === 2 || position === 3)
    return <MedailleGlace rang={position} className={className} id={`medaille-${id}`} />;
  return <span className="profil-rang-chiffre">{position}</span>;
}

/** Un chiffre de la bande : son nom, sa valeur, et une précision. */
function Chiffre({ nom, children, precision }: { nom: string; children: ReactNode; precision?: ReactNode }) {
  return (
    <div className="profil-chiffre">
      <dt>{nom}</dt>
      <dd>{children}</dd>
      {precision !== undefined && <p>{precision}</p>}
    </div>
  );
}

/**
 * La fiche d'un joueur.
 *
 * Un en-tête compact — qui il est, où il en est, ses cinq chiffres —, puis
 * des onglets, un sujet à la fois, sur toute la largeur :
 *
 *  - **Games** : la saison en colonnes de glace et sa forme, puis un tableau
 *    d'une ligne par game, filtrable et triable (`SaisonDuJoueur`) ;
 *  - **Duels** : le bilan, et chaque duel ;
 *  - **Flocons et cartes** : le solde, la chance aux boosters, les boosters à
 *    ouvrir et les cartes reçues ;
 *  - **Subs** : ce qu'il a offert à la chaîne, et ses Boosters Perso.
 *
 * Le grand livre n'est pas montré : la fiche est publique, `getFicheJoueur`
 * le retire côté serveur.
 *
 * Pour la modération, chaque game a son bouton « Corriger » : les kills et le
 * placement d'une capture mal lue, ou la game à supprimer (`CorrectionGame`).
 */
export function FicheJoueur({
  fiche,
  subs,
  moderation = false,
}: {
  fiche: DonneesFiche;
  subs: BilanSubs;
  /** La session est celle d'un membre de la modération : les games se corrigent. */
  moderation?: boolean;
}) {
  const { profil: p, rang, duels } = fiche;
  const t = p.totals;
  const aJoue = t.countedGames > 0;
  const classe = rang !== null && aJoue;
  const [onglet, setOnglet] = useState<Onglet>('games');
  const [filtre, setFiltre] = useState<Filtre>('toutes');
  const [tri, setTri] = useState<Tri>('recentes');
  const [tout, setTout] = useState(false);
  /** La game qu'un membre de la modération corrige, s'il y en a une. */
  const [aCorriger, setACorriger] = useState<GameACorriger | null>(null);

  const surtitre = fiche.streameuse
    ? 'Streameuse · hors classement'
    : !classe
      ? 'Pas encore de game cette saison'
      : rang.finaliste
        ? `${ordinal(rang.position)} au classement · qualifié pour la finale${
            rang.ecart !== null && rang.ecart > 0 ? ` · ${rang.ecart} pts d’avance` : ''
          }`
        : `${ordinal(rang.position)} au classement · à ${rang.ecart ?? 0} pts de la finale`;

  // Les games dans l'ordre où elles ont été jouées, numérotées.
  const chronologie = useMemo(() => [...p.games].sort((a, b) => a.playedAt.localeCompare(b.playedAt)), [p.games]);
  const numeroDe = useMemo(() => new Map(chronologie.map((g, i) => [g.id, i + 1])), [chronologie]);
  const meilleure = Math.max(1, ...chronologie.map((g) => g.score));
  const restantes = Math.max(0, fiche.creneaux - t.countedGames);
  const boostersPerso = p.packsDus.filter((b) => b.pack === 'perso').length;
  const avecCarte = chronologie.filter((g) => g.applied.length > 0).length;
  const top3 = chronologie.filter((g) => g.placement !== null && g.placement <= 3).length;

  const lignes = useMemo(() => {
    const filtrees = chronologie.filter((g) =>
      filtre === 'top3' ? g.placement !== null && g.placement <= 3 : filtre === 'carte' ? g.applied.length > 0 : true,
    );
    return tri === 'recentes'
      ? [...filtrees].reverse()
      : [...filtrees].sort((a, b) => b.score - a.score || b.playedAt.localeCompare(a.playedAt));
  }, [chronologie, filtre, tri]);
  const visibles = tout ? lignes : lignes.slice(0, GAMES_VISIBLES);


  const ONGLETS: { cle: Onglet; nom: string; compte?: number }[] = [
    { cle: 'games', nom: 'Games', compte: chronologie.length },
    { cle: 'duels', nom: 'Duels', compte: duels.joues },
    { cle: 'flocons', nom: 'Flocons et cartes', compte: p.ouvertures.length },
    { cle: 'subs', nom: 'Subs', compte: subs.offerts },
  ];

  return (
    <div className="profil">
      {/* =============================== L'en-tête ============================== */}
      <section className="glass profil-tete" aria-labelledby="profil-nom">
        <SnowCap radius="var(--r-lg)" seed={`profil-${p.slug}`} epaisseur={18} />
        <span className="profil-tete-lumiere" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>

        <div className="profil-identite">
          <div className="profil-avatar">
            {p.avatarUrl ? (
              // L'avatar Twitch : une image externe, déjà autorisée par la CSP.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.avatarUrl} alt="" />
            ) : (
              <span aria-hidden="true">{p.pseudo.slice(0, 2).toUpperCase()}</span>
            )}
            {classe && (
              <span className="profil-avatar-rang" aria-hidden="true">
                <Rang position={rang.position} id="avatar" className="h-full w-full" />
              </span>
            )}
          </div>
          <div className="min-w-0">
            <p className="eyebrow">{surtitre}</p>
            <h1 id="profil-nom" className="titre-glace profil-nom">
              <span className="glace" data-text={p.pseudo}>
                {p.pseudo}
              </span>
            </h1>
            <div className="profil-badges">
              {fiche.role !== 'joueur' && !fiche.streameuse && <span className="profil-badge">Modération</span>}
              <Link href="/" className="profil-badge no-underline">
                ← Classement
              </Link>
            </div>
          </div>
        </div>

        <dl className="profil-chiffres">
          <Chiffre
            nom="Points"
            precision={
              t.horsGame > 0
                ? `dont +${t.horsGame} pts bonus`
                : t.horsGame < 0
                  ? `dont −${-t.horsGame} de Verglas`
                : aJoue
                  ? `moyenne ${decimal(t.averageScore)}`
                  : 'aucune game'
            }
          >
            {t.totalScore}
          </Chiffre>
          <Chiffre nom="Rang" precision={classe ? (rang.finaliste ? 'en finale' : 'hors finale') : '—'}>
            {classe ? (
              <>
                {rang.position}
                <small>/{rang.sur}</small>
              </>
            ) : (
              '—'
            )}
          </Chiffre>
          <Chiffre nom="Games" precision={restantes > 0 ? `${restantes} à jouer` : 'toutes jouées'}>
            {t.countedGames}
            <small>/{fiche.creneaux}</small>
          </Chiffre>
          <Chiffre nom="Kills" precision={aJoue ? `${decimal(t.totalKills / t.countedGames)} par game` : '—'}>
            {t.totalKills}
          </Chiffre>
          <Chiffre nom="Flocons" precision={`chance ${libelleMultiplicateur(p.chance)}`}>
            {flakes(p.snowflakes)}
          </Chiffre>
        </dl>
      </section>

      {/* =============================== Les onglets ============================== */}
      <div className="profil-onglets" role="tablist" aria-label="La fiche de ce joueur">
        {ONGLETS.map((o) => (
          <button
            key={o.cle}
            type="button"
            role="tab"
            id={`onglet-${o.cle}`}
            aria-selected={onglet === o.cle}
            aria-controls={`panneau-${o.cle}`}
            onClick={() => setOnglet(o.cle)}
          >
            {o.nom}
            {o.compte !== undefined && <span className="profil-onglet-compte">{o.compte}</span>}
          </button>
        ))}
      </div>

      {/* ================================= Games ================================= */}
      {onglet === 'games' && (
        <section className="glass profil-panneau" role="tabpanel" id="panneau-games" aria-labelledby="onglet-games">
          {chronologie.length === 0 ? (
            <p className="profil-vide">
              Aucune game saisie pour l’instant. Elles arrivent ici dès la première capture.
            </p>
          ) : (
            <>
              {/* Quatre chiffres, en tuiles, comme ceux des duels. */}
              <dl className="profil-trio profil-quatuor">
                <Chiffre nom="Games" precision={restantes > 0 ? `${restantes} à jouer` : 'saison terminée'}>
                  {t.countedGames}
                  <small>/{fiche.creneaux}</small>
                </Chiffre>
                <Chiffre nom="Moyenne" precision="points par game">
                  {decimal(t.averageScore)}
                </Chiffre>
                <Chiffre nom="Meilleure" precision={`la moins bonne : ${t.worstScore} pt${Math.abs(t.worstScore) > 1 ? 's' : ''}`}>
                  {t.bestScore}
                </Chiffre>
                <Chiffre
                  nom="Podiums"
                  precision={
                    <span className="profil-podiums">
                      {([1, 2, 3] as const).map((n) => (
                        <span key={n}>
                          <Rang position={n} id={`podium-${n}`} className="h-5 w-5" />
                          <b>{n === 1 ? t.top1 : n === 2 ? t.top2 : t.top3}</b>
                        </span>
                      ))}
                    </span>
                  }
                >
                  {t.top1 + t.top2 + t.top3}
                </Chiffre>
              </dl>

              {/* La saison en colonnes de glace, et sa forme. */}
              {chronologie.length >= 3 && <ColonnesSaison chronologie={chronologie} moyenne={t.averageScore} />}

              {/* Les réglages de la liste : quoi montrer, dans quel ordre. */}
              <div className="profil-reglages">
                <div className="segment" role="group" aria-label="Quelles games montrer">
                  {(
                    [
                      ['toutes', `Toutes · ${chronologie.length}`],
                      ['top3', `Top 3 · ${top3}`],
                      ['carte', `Avec carte · ${avecCarte}`],
                    ] as const
                  ).map(([cle, nom]) => (
                    <button key={cle} type="button" aria-pressed={filtre === cle} onClick={() => setFiltre(cle)}>
                      {nom}
                    </button>
                  ))}
                </div>
                <div className="segment" role="group" aria-label="Dans quel ordre">
                  {(
                    [
                      ['recentes', 'Récentes'],
                      ['meilleures', 'Meilleures'],
                    ] as const
                  ).map(([cle, nom]) => (
                    <button key={cle} type="button" aria-pressed={tri === cle} onClick={() => setTri(cle)}>
                      {nom}
                    </button>
                  ))}
                </div>
              </div>

              {/* Le tableau : une ligne par game, toutes de la même hauteur. */}
              {lignes.length === 0 ? (
                <p className="profil-vide">Aucune game ne correspond.</p>
              ) : (
                <TableauGames
                  games={visibles}
                  numeroDe={numeroDe}
                  meilleure={meilleure}
                  moderation={moderation}
                  onCorrige={setACorriger}
                />
              )}
              {lignes.length > GAMES_VISIBLES && (
                <button type="button" className="btn profil-tout" onClick={() => setTout((v) => !v)}>
                  {tout ? 'Montrer moins' : `Voir les ${lignes.length} games`}
                </button>
              )}
              {aCorriger && (
                <CorrectionGame
                  key={aCorriger.id}
                  game={aCorriger}
                  numero={numeroDe.get(aCorriger.id) ?? 0}
                  pseudo={p.pseudo}
                  onClose={() => setACorriger(null)}
                />
              )}
            </>
          )}
        </section>
      )}

      {/* ================================= Duels ================================= */}
      {onglet === 'duels' && (
        <section className="glass profil-panneau" role="tabpanel" id="panneau-duels" aria-labelledby="onglet-duels">
          {duels.joues === 0 ? (
            <p className="profil-vide">Aucun duel joué pour l’instant.</p>
          ) : (
            <>
              <dl className="profil-trio">
                <Chiffre nom="Joués">{duels.joues}</Chiffre>
                <Chiffre nom="Gagnés" precision={`${Math.round((duels.gagnes / duels.joues) * 100)} % de victoires`}>
                  {duels.gagnes}
                </Chiffre>
                <Chiffre nom="Bilan" precision="flocons gagnés ou perdus">
                  <span className={duels.net > 0 ? 'text-aurora' : duels.net < 0 ? 'text-danger' : ''}>
                    {signe(duels.net)}
                  </span>
                </Chiffre>
              </dl>
              <ul className="profil-duels">
                {duels.derniers.map((d) => (
                  <li key={d.id} data-gagne={d.gagne ? '' : undefined}>
                    <span className="orbe orbe-sm" aria-hidden="true">
                      {d.adversaire.slice(0, 1).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <b>{d.gagne ? 'Gagné' : 'Perdu'}</b> contre {d.adversaire}
                      <small>{shortDateTime(d.resolueA)}</small>
                    </span>
                    <strong>
                      {d.gagne ? '+' : '−'}
                      {flakes(d.mise)} ❄
                    </strong>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      {/* =========================== Flocons et cartes =========================== */}
      {onglet === 'flocons' && (
        <section className="glass profil-panneau" role="tabpanel" id="panneau-flocons" aria-labelledby="onglet-flocons">
          <div className="profil-flocons">
            <div className="profil-chance">
              <div className="profil-chance-tete">
                <span>Solde</span>
                <strong>
                  {flakes(p.snowflakes)} <small>/ {flakes(ECONOMY.soldeMax)} ❄</small>
                </strong>
              </div>
              <div className="jauge-chance" aria-hidden="true">
                <span style={{ width: `${(p.chance / CHANCE.max) * 100}%` }} />
              </div>
              <p className="profil-note">
                Chance aux boosters <b className="text-ice">{libelleMultiplicateur(p.chance)}</b> : son solde pousse les
                raretés des boosters ouverts pour lui, jusqu’à ×{1 + CHANCE.max}.
              </p>
            </div>
            <div className="profil-chance">
              <div className="profil-chance-tete">
                <span>Boosters à ouvrir</span>
                <strong>{p.packsDus.length}</strong>
              </div>
              {p.packsDus.length === 0 ? (
                <p className="profil-note">Rien en attente : ses boosters sont ouverts à l’antenne.</p>
              ) : (
                // Un badge par type de booster, avec son nombre : vingt-trois
                // « Booster perso » à la suite ne disaient rien de plus qu'un 23.
                <ul className="profil-a-ouvrir">
                  {parType(p.packsDus).map(([pack, n]) => (
                    <li key={pack} className="profil-badge">
                      {getPack(pack)?.name ?? `Booster ${pack}`}
                      <span className="profil-badge-n num">{n}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          <h2 className="profil-sous-titre">Les cartes reçues</h2>
          {p.ouvertures.length === 0 ? (
            <p className="profil-vide">Aucune carte reçue pour l’instant.</p>
          ) : (
            // Une carte par sorte, la dernière reçue en tête : la pastille dit
            // combien de fois elle est tombée, la date dit quand pour la dernière.
            <ul className="profil-cartes">
              {parCarte(p.ouvertures).map(({ derniere: o, fois }) => (
                <li key={o.cardId}>
                  <span className="profil-carte">
                    <CardFrame
                      cardId={o.cardId}
                      name={o.nom}
                      rarity={o.rarity}
                      glyph={o.glyph}
                      nature={o.nature}
                      largeur="120px"
                    />
                    {fois > 1 && (
                      <span className="pastille-nombre num" aria-label={`reçue ${fois} fois`}>
                        <span className="pastille-x">×</span>
                        {fois}
                      </span>
                    )}
                  </span>
                  <b>{o.nom}</b>
                  <small>
                    {o.pack} · {shortDateTime(o.openedAt)}
                  </small>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* ================================= Subs ================================= */}
      {onglet === 'subs' && (
        <section className="glass profil-panneau" role="tabpanel" id="panneau-subs" aria-labelledby="onglet-subs">
          <dl className="profil-trio">
            <Chiffre nom="Subs offerts" precision="tous niveaux">
              {subs.offerts}
            </Chiffre>
            <Chiffre nom="Subs T3" precision="pris ou offerts">
              {subs.niveau3}
            </Chiffre>
            <Chiffre nom="Boosters Perso" precision="en attente">
              {boostersPerso}
            </Chiffre>
          </dl>
          <p className="profil-note">
            Un Booster Perso par sub T3, et un tous les {PACKS_REGLES.persoTousLes} subs offerts : versé d’office à qui
            paie, ouvert à l’antenne. Compté depuis que la chaîne annonce ses subs au site.
          </p>
        </section>
      )}
    </div>
  );
}

/**
 * Les cartes reçues, une par sorte : la plus récente de chacune, et combien de
 * fois elle est tombée. L'ordre reste celui de la liste, la plus récente en tête.
 */
function parCarte<T extends { cardId: string }>(ouvertures: T[]): { derniere: T; fois: number }[] {
  const sortes = new Map<string, { derniere: T; fois: number }>();
  for (const o of ouvertures) {
    const deja = sortes.get(o.cardId);
    if (deja) deja.fois += 1;
    else sortes.set(o.cardId, { derniere: o, fois: 1 });
  }
  return [...sortes.values()];
}

/** Les boosters à ouvrir, comptés par type, dans l'ordre où ils sont arrivés. */
function parType(dus: { pack: string }[]): [string, number][] {
  const n = new Map<string, number>();
  for (const d of dus) n.set(d.pack, (n.get(d.pack) ?? 0) + 1);
  return [...n];
}
