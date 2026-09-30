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
 * Le nombre de la saison, la jauge jusqu'au prochain palier et ce qu'il
 * rapporte, et l'évènement qui vient — ou celui qui court, avec son temps.
 * Quand le nombre monte, il compte jusqu'à sa nouvelle valeur ; quand un palier
 * tombe, une bannière dit lequel, et ce que tout le monde y gagne.
 */

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
    if (vue.enCours.length === 0) return;
    const t = setInterval(() => setHorloge(Date.now()), 1000);
    return () => clearInterval(t);
  }, [vue.enCours.length]);

  const enCours = vue.enCours.filter((e) => Date.parse(e.endsAt) > horloge);

  return (
    <Scene largeur={880} hauteur={260}>
      <div className="ov-subs glass" data-palier={palier ? '' : undefined}>
        <SnowCap radius="var(--r-lg)" seed="ov-subs" epaisseur={16} />

        <div className="ov-subs-compte">
          <span className="ov-subs-surtitre">Subs de la saison</span>
          <strong className="ov-subs-nombre" key={gain?.cle ?? 0} data-monte={gain ? '' : undefined}>
            {flakes(affiche)}
          </strong>
          {gain && (
            <span className="ov-subs-gain" key={`g-${gain.cle}`}>
              +{gain.n}
            </span>
          )}
        </div>

        <div className="ov-subs-suite">
          {vue.prochain && (
            <>
              <p className="ov-subs-prochain">
                <strong>{vue.prochain.label}</strong> dans <b>{vue.prochain.restant}</b> sub
                {vue.prochain.restant > 1 ? 's' : ''}
              </p>
              <span className="ov-subs-jauge" aria-hidden="true">
                <b style={{ width: `${Math.round(vue.prochain.progression * 100)}%` }} />
              </span>
              <p className="ov-subs-effet">{vue.prochain.description}</p>
            </>
          )}
          <p className="ov-subs-evenement">
            {enCours.length > 0 ? (
              <>
                <span className="ov-subs-pastille" aria-hidden="true" />
                <strong>{enCours[0].label}</strong> en cours · {minutes(enCours[0].endsAt, horloge)}
              </>
            ) : vue.evenement ? (
              <>
                <strong>{vue.evenement.label}</strong> dans {vue.evenement.restant} sub
                {vue.evenement.restant > 1 ? 's' : ''} · {vue.evenement.resume}
              </>
            ) : null}
          </p>
        </div>

        {palier && (
          <div className="ov-subs-palier" key={palier.cle}>
            <span>Palier franchi</span>
            <strong>{palier.label}</strong>
            <em>{palier.description}</em>
          </div>
        )}
      </div>
    </Scene>
  );
}
