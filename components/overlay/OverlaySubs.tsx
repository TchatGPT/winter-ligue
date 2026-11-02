'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Scene } from '@/components/overlay/Scene';
import { useFluxOverlay, type FluxRecu } from '@/components/overlay/useFluxOverlay';
import { SnowCap } from '@/components/SnowCap';
import { vueSubsDemo } from '@/components/overlay/demo';
import { flakes } from '@/components/ui';
import { crossedMilestones } from '@/lib/domain/rules';
import type { SubsOverlay } from '@/lib/services/overlay';

/**
 * Le compteur de subs du stream, toujours affiché.
 *
 * À gauche, le nombre de la saison ; quand il monte, il compte jusqu'à sa
 * nouvelle valeur, et le « +N » s'inscrit dessous — il recouvrait le texte
 * d'à côté. À droite, les paliers — Booster Commu, Avalanche, Booster Folie,
 * Tempête de neige — défilent l'un après l'autre (`DEFILE_MS`), chacun avec ce
 * qu'il reste et ce qu'il fait. Quand un palier tombe, une bannière l'annonce
 * **sous** le compteur, sans le cacher : le nombre qui monte reste à l'écran.
 */

/** Le temps qu'un palier reste affiché avant le suivant. */
const DEFILE_MS = 6000;

function minutes(fin: string, maintenant: number): string {
  const s = Math.max(0, Math.round((Date.parse(fin) - maintenant) / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`;
}

export function OverlaySubs({
  cle,
  depart,
  initial,
  demo = false,
}: {
  cle: string;
  depart: string;
  initial: SubsOverlay;
  demo?: boolean;
}) {
  const [vue, setVue] = useState<SubsOverlay>(initial);
  const [affiche, setAffiche] = useState(initial.total);
  const [gain, setGain] = useState<{ n: number; cle: number } | null>(null);
  const [palier, setPalier] = useState<{ label: string; description: string; cle: number } | null>(null);
  const [horloge, setHorloge] = useState(() => Date.now());
  const [tour, setTour] = useState(0);
  const precedent = useRef(initial.total);

  const recoit = useCallback((suivante: SubsOverlay) => {
    const avant = precedent.current;
    precedent.current = suivante.total;
    setVue(suivante);
    if (suivante.total <= avant) {
      setAffiche(suivante.total);
      return;
    }
    setGain({ n: suivante.total - avant, cle: Date.now() });
    const franchis = crossedMilestones(avant, suivante.total);
    const dernier = franchis[franchis.length - 1];
    if (dernier) setPalier({ label: dernier.label, description: dernier.description, cle: Date.now() });
  }, []);

  const surFlux = useCallback((flux: FluxRecu) => recoit(flux.subs), [recoit]);
  useFluxOverlay({ cle, depart, intervalle: 4000, actif: !demo, surFlux });

  // L'aperçu : des subs qui tombent, par petits paquets.
  useEffect(() => {
    if (!demo) return;
    const t = setInterval(() => {
      recoit(vueSubsDemo(precedent.current + 1 + Math.floor(Math.random() * 3)));
    }, 3500);
    return () => clearInterval(t);
  }, [demo, recoit]);

  // Le nombre compte jusqu'à sa nouvelle valeur.
  useEffect(() => {
    if (affiche === vue.total) return;
    const de = affiche;
    const vers = vue.total;
    const debut = performance.now();
    let image = 0;
    const pas = (t: number) => {
      const p = Math.min(1, (t - debut) / 900);
      const lisse = 1 - (1 - p) ** 3;
      setAffiche(Math.round(de + (vers - de) * lisse));
      if (p < 1) image = requestAnimationFrame(pas);
    };
    image = requestAnimationFrame(pas);
    return () => cancelAnimationFrame(image);
    // `affiche` suit l'animation elle-même : seule la cible la relance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vue.total]);

  useEffect(() => {
    if (!palier) return;
    const t = setTimeout(() => setPalier(null), 6000);
    return () => clearTimeout(t);
  }, [palier]);

  useEffect(() => {
    if (!gain) return;
    const t = setTimeout(() => setGain(null), 1800);
    return () => clearTimeout(t);
  }, [gain]);

  // Les paliers défilent, l'un après l'autre.
  const nbPaliers = vue.paliers.length;
  useEffect(() => {
    if (nbPaliers < 2) return;
    const t = setInterval(() => setTour((n) => n + 1), DEFILE_MS);
    return () => clearInterval(t);
  }, [nbPaliers]);

  useEffect(() => {
    if (vue.enCours.length === 0) return;
    const t = setInterval(() => setHorloge(Date.now()), 1000);
    return () => clearInterval(t);
  }, [vue.enCours.length]);

  const enCours = vue.enCours.filter((e) => Date.parse(e.endsAt) > horloge);
  const indice = nbPaliers > 0 ? tour % nbPaliers : 0;
  const montre = vue.paliers[indice] ?? null;

  return (
    <Scene largeur={880} hauteur={360}>
      <div className="ov-subs glass">
        <SnowCap radius="var(--r-lg)" seed="ov-subs" epaisseur={16} />

        <div className="ov-subs-compte">
          <span className="ov-subs-surtitre">Subs de la saison</span>
          <strong className="ov-subs-nombre" key={gain?.cle ?? 0} data-monte={gain ? '' : undefined}>
            {flakes(affiche)}
          </strong>
          {/* Sa place est gardée sous le nombre : rien ne bouge quand il paraît. */}
          <span className="ov-subs-gain-place" aria-live="polite">
            {gain && (
              <span className="ov-subs-gain" key={`g-${gain.cle}`}>
                +{gain.n} sub{gain.n > 1 ? 's' : ''}
              </span>
            )}
          </span>
        </div>

        <div className="ov-subs-suite">
          {montre && (
            <div className="ov-subs-defile" key={`${indice}-${montre.label}`}>
              <p className="ov-subs-prochain">
                <strong>{montre.label}</strong> dans <b>{montre.restant}</b> sub{montre.restant > 1 ? 's' : ''}
              </p>
              <span className="ov-subs-jauge" aria-hidden="true">
                <b style={{ width: `${Math.round(montre.progression * 100)}%` }} />
              </span>
              <p className="ov-subs-effet">{montre.description}</p>
            </div>
          )}
          <div className="ov-subs-pied">
            {nbPaliers > 1 && (
              <span className="ov-subs-points" aria-hidden="true">
                {vue.paliers.map((p, i) => (
                  <i key={p.label} data-actif={i === indice ? '' : undefined} />
                ))}
              </span>
            )}
            {enCours.length > 0 && (
              <p className="ov-subs-evenement">
                <span className="ov-subs-pastille" aria-hidden="true" />
                <strong>{enCours[0].label}</strong> en cours · {minutes(enCours[0].endsAt, horloge)}
              </p>
            )}
          </div>
        </div>
      </div>

      {palier && (
        <div className="ov-subs-palier glass" key={palier.cle}>
          <span>Palier franchi</span>
          <strong>{palier.label}</strong>
          <em>{palier.description}</em>
        </div>
      )}
    </Scene>
  );
}
