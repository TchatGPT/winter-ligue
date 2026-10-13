'use client';

import { type ReactNode, useEffect, useRef, useState } from 'react';
import { PresentoirBoosters, type BoosterPresente } from '@/components/PresentoirBoosters';
import { RARITY_META } from '@/lib/domain/catalog';
import type { Booster3D, SceneAccueil } from './scene';

type Etat = 'chargement' | 'pret' | 'sans3d';

/**
 * L'accueil immersif : la nuit polaire en trois dimensions en fond
 * (`scene.ts`), et par-dessus, l'interface.
 *
 *  - le nom de la ligue, l'entrée par Twitch ;
 *  - sous chaque booster, son nom — placé par la scène, qui sait où il est ;
 *  - en bas, une légende : ce qu'on survole, ou ce qu'on peut faire ;
 *  - un booster ouvert, le titre s'efface pour laisser la place à
 *    l'éventail, et un bouton ramène aux quatre boosters.
 *
 * Sans WebGL — ou si la scène ne se construit pas —, la vitrine en CSS prend
 * le relais (`PresentoirBoosters`) : la page reste entière.
 */
export function Accueil3D({
  boosters,
  enTete,
  actions,
}: {
  boosters: BoosterPresente[];
  /** Le surtitre, le nom et la phrase. */
  enTete: ReactNode;
  /** Les boutons : Twitch, et « comment ça marche ». */
  actions: ReactNode;
}) {
  const toile = useRef<HTMLCanvasElement>(null);
  const scene = useRef<SceneAccueil | null>(null);
  const etiquettes = useRef(new Map<string, HTMLElement>());
  const [etat, setEtat] = useState<Etat>('chargement');
  const [choisi, setChoisi] = useState<string | null>(null);
  const [survolBooster, setSurvolBooster] = useState<string | null>(null);
  const [survolCarte, setSurvolCarte] = useState<string | null>(null);

  useEffect(() => {
    const el = toile.current;
    if (!el) return;
    let annule = false;
    // Le moteur arrive à part : three.js ne pèse pas sur le reste du site.
    import('./scene')
      .then(({ creeSceneAccueil }) => {
        if (annule) return;
        const donnees: Booster3D[] = boosters.map((b) => ({
          id: b.id,
          nom: b.nom,
          art: b.art,
          couleur: RARITY_META[b.gemme ?? 'C'].color,
          flanc: b.gradient[0],
          cartes: b.cartes.map((c) => ({
            cardId: c.cardId,
            nom: c.name,
            sousTitre: c.subtitle,
            rarete: c.rarity,
            rareteLibelle: RARITY_META[c.rarity].label,
            couleur: RARITY_META[c.rarity].color,
            art: c.art ?? null,
            glyphe: c.glyph,
          })),
        }));
        scene.current = creeSceneAccueil(
          el,
          donnees,
          {
            pret: () => setEtat('pret'),
            survolBooster: setSurvolBooster,
            choix: setChoisi,
            survolCarte: setSurvolCarte,
          },
          () => etiquettes.current,
        );
      })
      .catch((erreur) => {
        console.error('[accueil 3D]', erreur);
        if (!annule) setEtat('sans3d');
      });
    return () => {
      annule = true;
      scene.current?.detruit();
      scene.current = null;
    };
  }, [boosters]);

  const ouvert = boosters.find((b) => b.id === choisi) ?? null;
  const survole = boosters.find((b) => b.id === survolBooster) ?? null;
  const carte = ouvert?.cartes.find((c) => c.cardId === survolCarte) ?? null;

  return (
    <div className="a3d" data-etat={etat} data-ouvert={ouvert ? '' : undefined}>
      <canvas ref={toile} className="a3d-toile" aria-hidden="true" />
      <div className="a3d-voile" aria-hidden="true" />

      <section className="a3d-hero" aria-labelledby="accueil-titre">
        <div className="a3d-texte">
          {enTete}
          <div className="a3d-actions">{actions}</div>
        </div>
      </section>

      {/* Le nom de chaque booster, sous lui : la scène les place. */}
      {etat !== 'sans3d' && (
        <div className="a3d-etiquettes" aria-hidden="true">
          {boosters.map((b) => (
          <span
            key={b.id}
            ref={(el) => {
              if (el) etiquettes.current.set(b.id, el);
              else etiquettes.current.delete(b.id);
            }}
            className="a3d-etiquette"
            aria-hidden="true"
          >
            {/* « Booster » tombe sur un écran étroit : « Perso », « Commu »… */}
            <span className="a3d-etiquette-mot">{b.nom.replace(/\s*\S+$/, '')} </span>
            {b.nom.split(/\s+/).pop()}
          </span>
          ))}
        </div>
      )}

      {etat !== 'sans3d' && (
        <div className="a3d-bas" data-pas-3d="">
          {ouvert && (
            <button type="button" className="a3d-retour" onClick={() => scene.current?.choisis(null)}>
              ← Les 4 boosters
            </button>
          )}
          <div className="a3d-legende" data-invite={!carte && !ouvert && !survole ? '' : undefined} aria-live="polite">
            {carte ? (
              <>
                <p className="a3d-legende-sur" style={{ color: RARITY_META[carte.rarity].color }}>
                  {RARITY_META[carte.rarity].label}
                </p>
                <p className="a3d-legende-titre">
                  {carte.name} <span>· {carte.subtitle}</span>
                </p>
                <p className="a3d-legende-texte">{carte.description}</p>
              </>
            ) : ouvert ? (
              <>
                <p className="a3d-legende-sur">
                  {ouvert.cartes.length} carte{ouvert.cartes.length > 1 ? 's' : ''}
                </p>
                <p className="a3d-legende-titre">{ouvert.nom}</p>
                <p className="a3d-legende-texte">
                  {ouvert.declencheur} <span>Survole ou touche une carte pour la lire.</span>
                </p>
              </>
            ) : survole ? (
              <>
                <p className="a3d-legende-sur">
                  {survole.cartes.length} carte{survole.cartes.length > 1 ? 's' : ''}
                </p>
                <p className="a3d-legende-titre">{survole.nom}</p>
                <p className="a3d-legende-texte">
                  {survole.accroche} <span>Clique pour l’ouvrir.</span>
                </p>
              </>
            ) : (
              <p className="a3d-legende-indice">Clique sur un booster pour l’ouvrir</p>
            )}
          </div>
        </div>
      )}

      {/* Sans WebGL, la vitrine en CSS. */}
      {etat === 'sans3d' && (
        <div className="a3d-repli">
          <PresentoirBoosters boosters={boosters} />
        </div>
      )}
    </div>
  );
}
