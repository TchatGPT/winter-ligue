import { CalendrierSaisons, type SaisonDuCalendrier } from '@/components/CalendrierSaisons';
import { EtapeAccueil } from '@/components/EtapeAccueil';
import { RailEtapes } from '@/components/RailEtapes';
import { type BoosterEnVitrine, VitrineBoosters } from '@/components/VitrineBoosters';
import { IconJauge, IconPack, IconSnowflake, IconSwords, IconTrophy, IconTwitch } from '@/components/icons';
import { GEMME_DU_PACK, PACKS, packArt } from '@/lib/domain/catalog';
import { num } from '@/lib/format';
import {
  ACHAT_PERSO,
  AVALANCHE_FLOCONS,
  CADEAU_DU_JOUR,
  CHANCE,
  DUEL,
  ECONOMY,
  EVENEMENTS_SUBS,
  JOKERS,
  PACKS_REGLES,
  PALIERS_CHANCE,
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
 *    lévitation au-dessus d'une banquise, chacun pris dans un bloc de glace,
 *    et un cartel par booster. Un clic brise la glace et montre trois de ses
 *    cartes ;
 *  - en bas, sur la glace, la ligue en cinq étapes (`EtapeAccueil`), dans
 *    l'ordre où on la vit. Chacune ouvre son détail. Si la fenêtre est trop
 *    étroite pour les cinq, c'est le rail qui défile, de gauche à droite
 *    (`RailEtapes`), jamais la page.
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
  const avalanche = EVENEMENTS_SUBS.find((e) => e.kind === 'FLOCONS_A_TOUS');
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

  // Quelques paliers de chance, du premier au plafond.
  const paliers = PALIERS_CHANCE.filter((p) => [1.1, 1.5, 2, 3, 4].includes(p.multiplicateur));
  const virgule = (x: number) => String(x).replace('.', ',');

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

        <VitrineBoosters boosters={boosters} entree={entree} />
      </section>

      {/* ---- La ligue en cinq étapes, en blocs de glace ---- */}
      <section className="acc-etapes" aria-labelledby="etapes-titre">
        <RailEtapes
          titre={
            <>
              <h2 id="etapes-titre">
                <span className="acc-etapes-sur">Comment ça marche</span>
                <span className="acc-etapes-grand">La ligue en cinq étapes</span>
              </h2>
              <span className="acc-etapes-trait" aria-hidden="true" />
            </>
          }
        >
          <EtapeAccueil
            numero={1}
            teinte="var(--gold)"
            theme="Le classement"
            icone={<IconTrophy />}
            titre="Marque des points"
            detail={
              <>
                <ol className="etape-liste">
                  <li>
                    <b>Chaque kill : 1 point.</b> Ta game est saisie par la modération, d’après ta capture de fin de
                    partie.
                  </li>
                  <li>
                    <b>Le top en plus :</b> +{PLACEMENT_POINTS['1']} pour un Top 1, +{PLACEMENT_POINTS['2']} pour un Top
                    2, +{PLACEMENT_POINTS['3']} pour un Top 3.
                  </li>
                  <li>
                    <b>Les cartes s’en mêlent :</b> bonus, malus, échanges — elles changent le score de tes games.
                  </li>
                  <li>
                    <b>{JOKERS.depart} Jokers au départ :</b> une game passée au Joker ne compte pas, ni en bien ni en
                    mal.
                  </li>
                </ol>
                <p className="etape-note">
                  {nomCourt(mini)} : {mini.games} games, pas de finale. {nomCourt(deuxieme)} : {deuxieme.games} games,
                  puis la finale des {deuxieme.finalistes} premiers.
                </p>
              </>
            }
          >
            <b>1 point</b> par kill, <b>+{PLACEMENT_POINTS['1']}</b> le Top 1, <b>+{PLACEMENT_POINTS['2']}</b> le
            Top 2, <b>+{PLACEMENT_POINTS['3']}</b> le Top 3. Tes {saison.games} games font ton total.
          </EtapeAccueil>
          <EtapeAccueil
            numero={2}
            teinte="var(--ice)"
            theme="Les flocons"
            icone={<IconSnowflake />}
            titre="Gagne des flocons"
            detail={
              <>
                <ol className="etape-liste">
                  <li>
                    <b>En jouant :</b> +{ECONOMY.perKill} ❄ par kill, +{ECONOMY.perPlacement['1']} ❄ le Top 1, +
                    {ECONOMY.perPlacement['2']} ❄ le Top 2, +{ECONOMY.perPlacement['3']} ❄ le Top 3.
                  </li>
                  <li>
                    <b>Chaque jour :</b> le cadeau du jour, +{CADEAU_DU_JOUR.parJour} ❄ — et le {CADEAU_DU_JOUR.cycle}ᵉ
                    jour d’affilée, un Booster Perso à la place.
                  </li>
                  <li>
                    <b>Pendant le live :</b> des codes cadeaux, et tous les {avalanche?.every ?? 100} subs une
                    Avalanche : +{AVALANCHE_FLOCONS} ❄ à chaque joueur qui a joué.
                  </li>
                  <li>
                    <b>Ils servent à :</b> miser en duel, augmenter ta chance aux boosters, ou t’offrir un Booster Perso
                    ({num(ACHAT_PERSO.prix)} ❄).
                  </li>
                </ol>
                <p className="etape-note">
                  Les flocons ne s’achètent pas : ils se gagnent. Plafond : {num(ECONOMY.soldeMax)} ❄.
                </p>
              </>
            }
          >
            <b>+{ECONOMY.perKill} ❄</b> par kill, <b>+{ECONOMY.perPlacement['1']} ❄</b> le Top 1,{' '}
            <b>+{CADEAU_DU_JOUR.parJour} ❄</b> chaque jour. Ils ne s’achètent pas : ils se gagnent.
          </EtapeAccueil>
          <EtapeAccueil
            numero={3}
            teinte="var(--violet)"
            theme="Les boosters"
            icone={<IconPack />}
            titre="Ouvre des boosters"
            detail={
              <>
                <ol className="etape-liste">
                  {boosters.map((b) => (
                    <li key={b.id}>
                      <b>
                        {b.nom} — {b.pour === 'toi' ? 'pour toi' : 'pour la ligue'} :
                      </b>{' '}
                      {b.comment}
                    </li>
                  ))}
                </ol>
                <p className="etape-note">
                  Chaque booster donne une carte, ouverte en direct sur le stream. Une carte à la fois : tant que la
                  tienne n’a pas joué, ton prochain booster attend son tour. Brise la glace d’un booster, en haut,
                  pour voir quelques-unes de ses cartes.
                </p>
              </>
            }
          >
            Les subs du live en font tomber, ouverts <b>en direct</b>. Chacun donne <b>une carte</b> qui change une
            game : bonus ou malus.
          </EtapeAccueil>
          <EtapeAccueil
            numero={4}
            teinte="var(--aurora)"
            theme="La chance"
            icone={<IconJauge />}
            titre="Vise les cartes rares"
            detail={
              <>
                <ol className="etape-liste">
                  <li>
                    <b>Quand un booster s’ouvre pour toi</b> — Perso ou Finisseur —, ton solde de flocons pousse le
                    tirage vers les cartes rares.
                  </li>
                  <li>
                    <b>Plus tu en gardes, plus tu tires haut :</b>{' '}
                    {paliers.map((p) => `${num(p.des)} ❄ → ×${virgule(p.multiplicateur)}`).join(' · ')}.
                  </li>
                  <li>
                    <b>Ouvrir ne coûte rien :</b> tes flocons restent. Les dépenser — un achat, un duel perdu — fait
                    baisser ta chance.
                  </li>
                </ol>
                <p className="etape-note">
                  Au plafond, quatre fois plus de chances pour chaque carte rare, ultra rare et légendaire. Les Boosters
                  Commu et Folie, eux, ne s’ouvrent pour personne : le sort décide seul.
                </p>
              </>
            }
          >
            Garde tes flocons : plus ta réserve est grosse, plus tu tires rare. Jusqu’à{' '}
            <b>×{1 + CHANCE.max} de chance</b>.
          </EtapeAccueil>
          <EtapeAccueil
            numero={5}
            teinte="color-mix(in srgb, var(--live) 55%, var(--violet))"
            theme="Les duels"
            icone={<IconSwords />}
            titre="Défie les autres"
            detail={
              <>
                <ol className="etape-liste etape-liste-duel">
                  <li>
                    <b>Tu lances un duel</b> et tu choisis ta mise :{' '}
                    {DUEL.mises.slice(0, -1).map(num).join(', ')} ou {num(DUEL.miseMax)} ❄. Elle est mise de côté
                    tout de suite.
                  </li>
                  <li>
                    <b>Un autre joueur le relève</b>, avec la même mise. Personne ? Tu annules, et ta mise te revient.
                  </li>
                  <li>
                    <b>La course se joue en direct</b>, sous vos yeux. Une chance sur deux : ni ton solde, ni ton rang
                    ne comptent.
                  </li>
                  <li>
                    <b>Le gagnant rafle tout :</b> les deux mises, soit le double de la sienne. Le perdant perd sa mise.
                  </li>
                </ol>
                <p className="etape-note">
                  On ne mise que des flocons, jamais des points du classement, et le site ne prend rien au passage.{' '}
                  {DUEL.enAttenteMax} duels en attente au plus.
                </p>
              </>
            }
          >
            Mise de <b>{num(DUEL.miseMin)} à {num(DUEL.miseMax)} ❄</b> contre un joueur. Une course en direct,{' '}
            <b>une chance sur deux</b> : le gagnant rafle les deux mises.
          </EtapeAccueil>
        </RailEtapes>
        <div className="acc-fin">{rejoindre}</div>
      </section>
    </div>
  );
}
