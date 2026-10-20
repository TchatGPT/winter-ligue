'use client';

import { useParams, usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';

declare global {
  interface Window {
    si?: (...args: unknown[]) => void;
    siq?: unknown[][];
  }
}

/**
 * La route d'une page, sans ses paramètres : « /joueurs/[slug] » plutôt que le
 * pseudo de chacun, pour que les mesures d'une même page s'additionnent.
 */
function routeDe(chemin: string, params: Record<string, string | string[] | undefined>): string {
  let route = chemin;
  for (const [cle, valeur] of Object.entries(params)) {
    if (typeof valeur !== 'string' || !valeur) continue;
    route = route.replace(`/${encodeURIComponent(valeur)}`, `/[${cle}]`).replace(`/${valeur}`, `/[${cle}]`);
  }
  return route;
}

/**
 * Les mesures de vitesse de Vercel (Speed Insights), vues du navigateur de
 * chaque visiteur : le temps de la première réponse, du premier affichage, de
 * la plus grande image, la réactivité au clic — sur les vrais téléphones, pas
 * sur un banc d'essai. C'est le tableau de bord du projet, chez Vercel, qui
 * les montre.
 *
 * Le script est servi par Vercel lui-même (`/_vercel/speed-insights/`), sur
 * l'origine du site : la CSP n'a rien à ouvrir. Il est posé par ce composant,
 * un script de confiance, ce que `strict-dynamic` autorise. C'est ce que fait
 * le paquet `@vercel/speed-insights`, sans la dépendance.
 */
export function MesureVitesse() {
  const chemin = usePathname();
  const params = useParams() ?? {};
  const route = routeDe(chemin ?? '/', params);
  const script = useRef<HTMLScriptElement | null>(null);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (script.current) {
      // Une navigation dans le site : les mesures suivantes sont pour cette page.
      script.current.dataset.route = route;
      return;
    }
    window.si ??= (...args: unknown[]) => {
      (window.siq ??= []).push(args);
    };
    const s = document.createElement('script');
    s.src = '/_vercel/speed-insights/script.js';
    s.defer = true;
    s.dataset.route = route;
    document.head.appendChild(s);
    script.current = s;
  }, [route]);

  return null;
}
