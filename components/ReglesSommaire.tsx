'use client';

import { type ReactNode, useSyncExternalStore } from 'react';
import { SnowCap } from '@/components/SnowCap';

/** Un sujet des règles : son entrée dans le sommaire, et sa page. */
export interface SujetRegles {
  id: string;
  titre: string;
  /** Ce qu'il faut en retenir, en une ligne. */
  resume: string;
  /** La médaille du sommaire, et celle de la page (deux dégradés distincts). */
  medaille: ReactNode;
  medailleGrande: ReactNode;
  contenu: ReactNode;
}

/**
 * Le sujet ouvert vit dans l'adresse (`#regle-flocons`) : on peut le partager,
 * et le bouton retour revient au sujet d'avant. Sur un téléphone, la même
 * ancre fait défiler jusqu'au sujet.
 */
const ecoute = (rappel: () => void) => {
  window.addEventListener('hashchange', rappel);
  return () => window.removeEventListener('hashchange', rappel);
};
const lit = () => window.location.hash.slice(1).replace(/^regle-/, '');

/**
 * Les règles, en sommaire et en pages.
 *
 * Sur un ordinateur : le sommaire à gauche, le sujet choisi à droite, et
 * l'ensemble tient dans la fenêtre. Sur un téléphone : le sommaire en grille,
 * qui mène à chaque sujet, et tous les sujets les uns sous les autres.
 */
export function ReglesSommaire({ sujets }: { sujets: SujetRegles[] }) {
  const hash = useSyncExternalStore(ecoute, lit, () => '');
  const actif = sujets.some((s) => s.id === hash) ? hash : sujets[0].id;

  return (
    <div className="rgs">
      <nav className="glass rgs-nav" aria-label="Les règles">
        <SnowCap radius="var(--r-lg)" seed="regles-sommaire" epaisseur={14} />
        <div className="rgs-nav-tete">
          <p className="eyebrow">Saison 1</p>
          <h1 className="rgs-nav-titre">Les règles</h1>
        </div>
        <ol className="rgs-liste">
          {sujets.map((s, i) => (
            <li key={s.id}>
              <a
                href={`#regle-${s.id}`}
                className="rgs-entree no-underline"
                aria-current={s.id === actif ? 'true' : undefined}
              >
                <span className="rgs-numero">{i + 1}</span>
                {s.medaille}
                <span className="min-w-0">
                  <span className="rgs-entree-titre">{s.titre}</span>
                  <span className="rgs-entree-resume">{s.resume}</span>
                </span>
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <div className="rgs-pages">
        {sujets.map((s, i) => (
          <section
            key={s.id}
            id={`regle-${s.id}`}
            className="glass rgs-page"
            data-actif={s.id === actif ? '' : undefined}
            aria-labelledby={`regle-titre-${s.id}`}
          >
            <SnowCap radius="var(--r-lg)" seed={`regle-${s.id}`} epaisseur={16} />
            <header className="rgs-page-tete">
              {s.medailleGrande}
              <div className="min-w-0">
                <p className="rgs-page-numero">
                  {i + 1} / {sujets.length}
                </p>
                <h2 id={`regle-titre-${s.id}`} className="rgs-page-titre">
                  {s.titre}
                </h2>
                <p className="rgs-page-resume">{s.resume}</p>
              </div>
            </header>
            <div className="rgs-page-corps">{s.contenu}</div>
            {/* Pour lire les règles dans l'ordre, d'un sujet au suivant. */}
            <footer className="rgs-page-pied">
              {i > 0 ? (
                <a href={`#regle-${sujets[i - 1].id}`} className="btn btn-sm no-underline">
                  ← {sujets[i - 1].titre}
                </a>
              ) : (
                <span />
              )}
              {i < sujets.length - 1 && (
                <a href={`#regle-${sujets[i + 1].id}`} className="btn btn-sm btn-ice no-underline">
                  {sujets[i + 1].titre} →
                </a>
              )}
            </footer>
          </section>
        ))}
      </div>
    </div>
  );
}
