'use client';

import { useEffect, useState } from 'react';

/**
 * Le navigateur d'une appli (17/11/2026) : un lien touché dans Twitch, Discord,
 * Instagram… s'ouvre dans le petit navigateur de cette appli, qui garde ses
 * cookies à part et les efface souvent — la session s'y perd, et il faut se
 * reconnecter. Un bandeau, en haut et par-dessus la page (rien ne bouge
 * dessous), propose d'ouvrir le site dans le vrai navigateur du téléphone.
 * Fermé, il ne revient pas sur ce navigateur-là.
 */

/** Ce que les applis écrivent dans l'identité de leur navigateur. */
const APPLIS: readonly [RegExp, string][] = [
  [/Twitch/i, 'Twitch'],
  [/Discord/i, 'Discord'],
  [/Instagram/i, 'Instagram'],
  [/FBAN|FBAV|FB_IAB|FBIOS/i, 'Facebook'],
  [/Snapchat/i, 'Snapchat'],
  [/musical_ly|Bytedance|TikTok/i, 'TikTok'],
  [/Twitter/i, 'X'],
  [/\bLine\//i, 'Line'],
];

const CLE = 'wl-navigateur-integre-vu';

function appliDe(ua: string): string | null {
  for (const [motif, nom] of APPLIS) if (motif.test(ua)) return nom;
  // Une vue web d'Android, sans nom d'appli : « ; wv) » dans son identité.
  if (/Android.*;\s*wv\)/i.test(ua)) return 'cette appli';
  return null;
}

export function NavigateurIntegre() {
  const [appli, setAppli] = useState<string | null>(null);
  const [android, setAndroid] = useState(false);
  const [copie, setCopie] = useState(false);

  useEffect(() => {
    const ua = navigator.userAgent;
    const nom = appliDe(ua);
    if (!nom) return;
    try {
      if (window.localStorage.getItem(CLE)) return;
    } catch {
      // Sans mémoire du navigateur, le bandeau s'affiche : il se ferme d'un geste.
    }
    // Lu après l'hydratation : le serveur ne connaît pas le navigateur.
    const t = setTimeout(() => {
      setAndroid(/Android/i.test(ua));
      setAppli(nom);
    }, 0);
    return () => clearTimeout(t);
  }, []);

  if (!appli) return null;

  const ferme = () => {
    setAppli(null);
    try {
      window.localStorage.setItem(CLE, '1');
    } catch {
      // Rien à faire : il reviendra à la prochaine visite.
    }
  };

  const copieLien = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopie(true);
    } catch {
      setCopie(false);
    }
  };

  // Sur Android, Chrome s'ouvre directement sur la même page.
  const versChrome = `intent://${window.location.host}${window.location.pathname}${window.location.search}#Intent;scheme=https;package=com.android.chrome;end`;

  return (
    <div className="nav-integre" role="region" aria-label="Ouvrir dans ton navigateur">
      <p>
        <b>Tu es dans le navigateur de {appli}.</b> Pour rester connecté, ouvre le site dans{' '}
        {android ? 'Chrome' : 'Safari'} : menu <span aria-hidden="true">⋯</span> → « Ouvrir dans le navigateur ».
      </p>
      <div className="nav-integre-gestes">
        {android ? (
          <a className="btn btn-sm btn-ice" href={versChrome}>
            Ouvrir dans Chrome
          </a>
        ) : (
          <button type="button" className="btn btn-sm btn-ice" onClick={() => void copieLien()}>
            {copie ? 'Lien copié' : 'Copier le lien'}
          </button>
        )}
        <button type="button" className="btn btn-sm btn-ghost" onClick={ferme} aria-label="Fermer ce message">
          ✕
        </button>
      </div>
    </div>
  );
}
