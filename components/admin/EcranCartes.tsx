'use client';

import { useState } from 'react';
import { useAction } from '@/components/admin/action';
import { Bloc, Ecran } from '@/components/admin/Cadre';
import { EmptyState, RarityChip } from '@/components/ui';
import { RARITY_META } from '@/lib/domain/catalog';
import { RARITIES } from '@/lib/domain/types';
import { shortDateTime } from '@/lib/format';

export interface LigneCollectible {
  id: string;
  kind: string;
  name: string;
  subtitle: string;
  rarity: string;
  glyph: string;
  createdAt: string;
}

/**
 * Les cartes créées par la modération : moments et cartes Joueur.
 *
 * Elles n'ont aucun effet en jeu, et c'est ce qui rend leur création sans
 * danger : on peut en graver autant qu'on veut sans toucher à l'équilibrage.
 * Elles entrent dans les tirages de collection dès leur création.
 */
export function EcranCartes({ collectibles }: { collectibles: LigneCollectible[] }) {
  const { busy, message, envoie } = useAction();
  const [nom, setNom] = useState('');
  const [sousTitre, setSousTitre] = useState('');
  const [rarete, setRarete] = useState('R');
  const [glyphe, setGlyphe] = useState('🏅');

  return (
    <Ecran
      titre="Cartes"
      lead="Un record, une vente folle, un palier de subs. Ces cartes n’ont aucun effet en jeu : elles se collectionnent et se revendent, rien de plus."
      message={message}
    >
      <Bloc titre="Graver un moment">
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const fait = await envoie('/api/admin/collection', {
              name: nom,
              subtitle: sousTitre,
              description: 'Un instant de la saison, gravé dans une carte.',
              rarity: rarete,
              glyph: glyphe,
            });
            if (fait) {
              setNom('');
              setSousTitre('');
            }
          }}
        >
          <div>
            <label className="label" htmlFor="moment-nom">
              Titre
            </label>
            <input
              id="moment-nom"
              className="field"
              value={nom}
              onChange={(e) => setNom(e.target.value)}
              minLength={2}
              maxLength={48}
              required
              placeholder="Record de kills"
            />
          </div>
          <div>
            <label className="label" htmlFor="moment-sous-titre">
              Sous-titre
            </label>
            <input
              id="moment-sous-titre"
              className="field"
              value={sousTitre}
              onChange={(e) => setSousTitre(e.target.value)}
              maxLength={64}
              placeholder="24 kills en une game"
            />
          </div>
          <div>
            <label className="label" htmlFor="moment-rarete">
              Rareté
            </label>
            <select
              id="moment-rarete"
              className="field"
              value={rarete}
              onChange={(e) => setRarete(e.target.value)}
            >
              {RARITIES.map((r) => (
                <option key={r} value={r}>
                  {RARITY_META[r].label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="moment-glyphe">
              Symbole
            </label>
            <input
              id="moment-glyphe"
              className="field"
              value={glyphe}
              onChange={(e) => setGlyphe(e.target.value)}
              maxLength={8}
            />
          </div>
          <div className="sm:col-span-2">
            <button className="btn btn-ice w-full" disabled={busy !== null || nom.length < 2}>
              Créer la carte
            </button>
          </div>
        </form>
      </Bloc>

      <section className="glass">
        <h3 className="border-b border-white/10 px-4 py-2.5 font-display text-sm font-black tracking-wider text-ink uppercase">
          Cartes créées ({collectibles.length})
        </h3>
        {collectibles.length === 0 ? (
          <div className="p-4">
            <EmptyState title="Aucune carte gravée" hint="Les moments de la saison apparaîtront ici." />
          </div>
        ) : (
          <div className="scroll-x">
            <table className="grid-table min-w-[620px]">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Nom</th>
                  <th>Sous-titre</th>
                  <th className="text-right">Rareté</th>
                </tr>
              </thead>
              <tbody>
                {collectibles.map((c) => (
                  <tr key={c.id}>
                    <td className="text-xs whitespace-nowrap text-faint">
                      {shortDateTime(c.createdAt)}
                    </td>
                    <td className="text-xs text-muted">{c.kind}</td>
                    <td className="text-ink">
                      <span aria-hidden="true">{c.glyph}</span> {c.name}
                    </td>
                    <td className="text-xs text-muted">{c.subtitle}</td>
                    <td className="text-right">
                      <RarityChip rarity={c.rarity} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </Ecran>
  );
}
