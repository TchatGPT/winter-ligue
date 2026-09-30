'use client';

import { useState } from 'react';
import { useAction } from '@/components/admin/action';
import { Bloc, Ecran } from '@/components/admin/Cadre';
import type { NavIconName } from '@/components/icons';
import { OverlayBooster } from '@/components/overlay/OverlayBooster';
import { OverlayDuel } from '@/components/overlay/OverlayDuel';
import { OverlaySubs } from '@/components/overlay/OverlaySubs';
import { vueSubsDemo } from '@/components/overlay/demo';

type IdOverlay = 'booster' | 'duel' | 'subs';

const OVERLAYS: { id: IdOverlay; titre: string; icone: NavIconName; aide: string; largeur: number; hauteur: number }[] = [
  {
    id: 'booster',
    titre: 'Ouverture de booster',
    icone: 'rocket',
    aide: 'Quand la streameuse ouvre un booster : il surgit en 3D avec le nom du joueur, s’ouvre sur le rail du site, puis la carte reste quelques secondes à l’écran.',
    largeur: 1920,
    hauteur: 1080,
  },
  {
    id: 'duel',
    titre: 'Duel lancé',
    icone: 'swords',
    aide: 'Quand un joueur lance un duel et attend un adversaire : son nom, sa mise, et « !duel » dans le tchat en dessous.',
    largeur: 1200,
    hauteur: 420,
  },
  {
    id: 'subs',
    titre: 'Compteur de subs',
    icone: 'snowflake',
    aide: 'Toujours affiché : les subs de la saison, le prochain palier et ce qu’il rapporte, l’évènement qui vient.',
    largeur: 880,
    hauteur: 260,
  },
];

/**
 * Les overlays du stream : un aperçu qui tourne, le lien à coller dans OBS,
 * et la régénération des liens.
 *
 * Le lien porte une clé : il est masqué à l'écran, et se copie sans s'afficher
 * — un écran d'administration finit toujours par passer en direct. S'il a
 * fuité, un administrateur régénère : tous les anciens liens cessent de
 * marcher.
 */
export function EcranOverlays({
  base,
  cle,
  depart,
  estAdmin,
}: {
  base: string;
  cle: string;
  depart: string;
  estAdmin: boolean;
}) {
  const { busy, message, envoie, setMessage } = useAction();
  const [visible, setVisible] = useState<IdOverlay | null>(null);
  const [son, setSon] = useState(false);

  const lien = (id: IdOverlay) => `${base}/overlay/${id}?cle=${cle}${id === 'booster' && son ? '&son=1' : ''}`;

  async function copie(id: IdOverlay) {
    try {
      await navigator.clipboard.writeText(lien(id));
      setMessage({ kind: 'success', text: 'Lien copié. Colle-le dans une source « Navigateur » d’OBS.' });
    } catch {
      setVisible(id);
      setMessage({ kind: 'error', text: 'Copie impossible ici : le lien est affiché, sélectionne-le.' });
    }
  }

  async function regenere() {
    if (!window.confirm('Tous les liens d’overlay actuels cesseront de marcher. Il faudra les recoller dans OBS. Continuer ?')) {
      return;
    }
    setVisible(null);
    await envoie('/api/admin/overlay', {}, { cle: 'regenere', succes: 'Liens régénérés : recolle-les dans OBS.' });
  }

  return (
    <Ecran
      titre="Overlays"
      lead="Trois sources pour OBS, aux couleurs du site. Elles suivent la ligue en direct : rien à déclencher à la main."
      message={message}
      actions={
        estAdmin && (
          <button className="btn btn-sm btn-danger" disabled={busy !== null} onClick={regenere}>
            Régénérer les liens
          </button>
        )
      }
    >
      <Bloc titre="Dans OBS" icone="antenne" neige="admin-obs">
        <ol className="admin-etapes">
          <li>
            <strong>Sources</strong> → <strong>+</strong> → <strong>Navigateur</strong>.
          </li>
          <li>Colle le lien de l’overlay, et règle la largeur et la hauteur conseillées.</li>
          <li>
            Coche <strong>« Rafraîchir le navigateur quand la scène devient active »</strong>. Le fond est déjà
            transparent : aucun CSS à ajouter.
          </li>
        </ol>
        <p className="admin-note">
          Un lien ne montre que ce que le stream montre déjà, sans rien pouvoir modifier. Ne l’affiche pas en
          direct ; s’il a fuité, régénère les liens.
        </p>
      </Bloc>

      <div className="admin-overlays">
        {OVERLAYS.map((o) => (
          <Bloc key={o.id} titre={o.titre} icone={o.icone} aide={o.aide}>
            <div className="admin-apercu" style={{ aspectRatio: `${o.largeur} / ${o.hauteur}` }}>
              {o.id === 'booster' && <OverlayBooster cle="" depart={depart} demo />}
              {o.id === 'duel' && <OverlayDuel cle="" depart={depart} demo />}
              {o.id === 'subs' && <OverlaySubs cle="" depart={depart} initial={vueSubsDemo(42)} demo />}
            </div>

            <div className="admin-lien">
              <code title={visible === o.id ? lien(o.id) : undefined}>
                {visible === o.id ? lien(o.id) : `${base}/overlay/${o.id}?cle=••••••••••••`}
              </code>
              <div className="admin-lien-actions">
                <button className="btn btn-sm" onClick={() => setVisible((v) => (v === o.id ? null : o.id))}>
                  {visible === o.id ? 'Masquer' : 'Afficher'}
                </button>
                <button className="btn btn-sm btn-ice" onClick={() => copie(o.id)}>
                  Copier le lien
                </button>
              </div>
            </div>

            <div className="admin-overlay-pied">
              <span>
                Source conseillée : <strong>{o.largeur} × {o.hauteur}</strong>
              </span>
              {o.id === 'booster' && (
                <label className="admin-case">
                  <input type="checkbox" checked={son} onChange={(e) => setSon(e.target.checked)} />
                  Avec le son du rail
                </label>
              )}
              <a href={`/overlay/${o.id}?demo=1`} target="_blank" rel="noreferrer" className="admin-lien-demo">
                Aperçu plein écran ↗
              </a>
            </div>
          </Bloc>
        ))}
      </div>
    </Ecran>
  );
}
