'use client';

import { useMemo, useState } from 'react';
import { useAction } from '@/components/admin/action';
import { Bloc, Ecran } from '@/components/admin/Cadre';
import { CardFrame } from '@/components/CardFrame';
import { RailPack, type CarteRailPack } from '@/components/RailPack';
import { prechargeSons, reveilleSon } from '@/components/bruitage';
import { EmptyState, Notice, RarityChip, flakes, rarityMeta } from '@/components/ui';
import { RARITIES, type PackId, type Rarity } from '@/lib/domain/types';
import { libelleMultiplicateur, WEIGHT_TOTAL } from '@/lib/domain/rules';
import type { OuvertureVue, PackDuVue } from '@/lib/services/packs';
import { COURBE_MESUREE } from '@/lib/spin/courbe';
import { shortDateTime } from '@/lib/format';

export interface PackAdmin {
  id: PackId;
  name: string;
  tagline: string;
  declencheur: string;
  portee: 'JOUEUR' | 'TOUS';
  pourQui: string;
  weights: Record<Rarity, number>;
  modifie: boolean;
  /** Les cartes que ce pack peut donner : le pool des leurres du rail. */
  cartes: CarteRailPack[];
}

export interface JoueurPack {
  id: string;
  pseudo: string;
  snowflakes: number;
  /** La chance que son solde lui donne, de 0 à 1. */
  chance: number;
}

/**
 * L'écran des packs : la file, l'ouverture à l'antenne, et les taux.
 *
 * C'est l'écran qu'on regarde pendant le live. La file dit ce qui est dû et à
 * qui ; un clic ouvre, le rail tourne, la carte se pose et l'écran dit sur qui
 * elle est tombée. Le tirage a eu lieu côté serveur avant que le rail ne
 * parte — l'écran met en scène un résultat déjà écrit.
 */
export function EcranPacks({
  file,
  packs,
  ouvertures,
  joueurs,
  estAdmin,
}: {
  file: PackDuVue[];
  packs: PackAdmin[];
  ouvertures: OuvertureVue[];
  joueurs: JoueurPack[];
  estAdmin: boolean;
}) {
  const { busy, message, envoie } = useAction();

  /** L'ouverture en cours de mise en scène, et si le rail doit tourner. */
  const [scene, setScene] = useState<{ ouverture: OuvertureVue; anime: boolean } | null>(null);
  const [revele, setRevele] = useState(false);

  /** L'ouverture à la main. */
  const [packManuel, setPackManuel] = useState<PackId>('perso');
  const [joueurManuel, setJoueurManuel] = useState('');

  const packDe = (id: PackId) => packs.find((p) => p.id === id);

  async function ouvre(corps: Record<string, unknown>) {
    reveilleSon();
    void prechargeSons();
    const data = await envoie(
      '/api/admin/packs',
      { ...corps, idempotencyKey: crypto.randomUUID() },
      { cle: 'ouvrir', succes: 'Pack ouvert.' },
    );
    if (!data) return;
    setRevele(false);
    setScene({ ouverture: data as unknown as OuvertureVue, anime: true });
  }

  const packManuelDef = packDe(packManuel);
  const joueurRequis = packManuelDef?.portee === 'JOUEUR';

  return (
    <Ecran
      titre="Boosters"
      lead="Ce qui est dû, ce qu'on ouvre à l'antenne, et sur qui la carte tombe. Le tirage est fait par le serveur au moment du clic ; le rail ne fait que le révéler."
      message={message}
    >
      {/* ------------------------------ La scène ---------------------------- */}
      {scene && (
        <section className="glass relative space-y-4 px-4 py-5">
          <Scene
            scene={scene}
            pack={packDe(scene.ouverture.packId)}
            revele={revele}
            onRevele={() => setRevele(true)}
            onFerme={() => setScene(null)}
          />
        </section>
      )}

      <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
        {/* ------------------------------ La file --------------------------- */}
        <Bloc
          titre={`À ouvrir — ${file.length}`}
          aide="Dans l'ordre d'arrivée. Un Booster Perso s'ouvre pour le joueur qui l'a gagné ; un Booster Commu tombe sur un ou deux joueurs tirés au sort, un Booster Folie sur toute la ligue."
        >
          {file.length === 0 ? (
            <EmptyState
              title="Rien en attente"
              hint="Les subs, les paliers et les fins de saison remplissent cette file."
            />
          ) : (
            <ul className="space-y-2">
              {file.map((p) => (
                <li
                  key={p.id}
                  className="flex flex-wrap items-center gap-3 rounded-2xl bg-black/22 px-3 py-2.5"
                >
                  <span className="font-display text-[15px] font-black text-ink">{p.nom}</span>
                  <span className="text-[14px] text-ink-2">
                    {p.pseudo ? (
                      <>
                        pour <strong className="text-aurora">{p.pseudo}</strong>
                      </>
                    ) : (
                      `pour ${packDe(p.packId)?.pourQui ?? 'la ligue'}`
                    )}
                  </span>
                  <span className="text-[12px] text-faint">
                    {p.raison} · {shortDateTime(p.creeA)}
                  </span>
                  <button
                    type="button"
                    className="btn btn-sm btn-ice ml-auto"
                    disabled={busy !== null || scene !== null}
                    onClick={() => ouvre({ packDuId: p.id })}
                  >
                    Ouvrir
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Bloc>

        {/* --------------------------- À la main ---------------------------- */}
        <Bloc
          titre="Ouvrir à la main"
          aide="Hors file : un lot, un rattrapage, un test à l'antenne. L'ouverture est journalisée comme les autres."
        >
          <div className="space-y-3">
            <div>
              <label className="label" htmlFor="pack-manuel">
                Booster
              </label>
              <select
                id="pack-manuel"
                className="field"
                value={packManuel}
                onChange={(e) => setPackManuel(e.target.value as PackId)}
              >
                {packs.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} — pour {p.pourQui}
                  </option>
                ))}
              </select>
            </div>
            {joueurRequis && (
              <div>
                <label className="label" htmlFor="joueur-manuel">
                  Joueur
                </label>
                <select
                  id="joueur-manuel"
                  className="field"
                  value={joueurManuel}
                  onChange={(e) => setJoueurManuel(e.target.value)}
                >
                  <option value="">— Choisir —</option>
                  {joueurs.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.pseudo} — ❄ {flakes(j.snowflakes)} · {libelleMultiplicateur(j.chance)}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <button
              type="button"
              className="btn btn-ice w-full"
              disabled={busy !== null || scene !== null || (joueurRequis && !joueurManuel)}
              onClick={() =>
                ouvre({
                  packId: packManuel,
                  ...(joueurRequis ? { joueurId: joueurManuel } : {}),
                })
              }
            >
              Ouvrir {packManuelDef?.name ?? ''}
            </button>
            <p className="text-[13px] leading-relaxed text-faint">
              La chance d’un joueur vient de son solde de flocons : le multiplicateur monte de ×1 à
              ×2 avec le solde, et plafonne à ×2. Elle ne s’applique jamais à un booster collectif.
            </p>
          </div>
        </Bloc>
      </div>

      {/* --------------------------- Les dernières -------------------------- */}
      <section className="glass">
        <h3 className="border-b border-white/10 px-4 py-2.5 font-display text-sm font-black tracking-wider text-ink uppercase">
          Dernières ouvertures
        </h3>
        {ouvertures.length === 0 ? (
          <div className="p-4">
            <EmptyState title="Aucune ouverture" hint="La première apparaîtra ici." />
          </div>
        ) : (
          <ul className="divide-y divide-white/8">
            {ouvertures.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-[14px]">
                <span className="text-xs whitespace-nowrap text-faint">{shortDateTime(o.openedAt)}</span>
                <span className="text-muted">{o.pack}</span>
                <span className="font-display font-bold" style={{ color: rarityMeta(o.rarity).color }}>
                  {o.glyph} {o.nom}
                </span>
                <span className="text-ink-2">
                  →{' '}
                  {o.pseudo ? (
                    <strong className="text-ink">{o.pseudo}</strong>
                  ) : o.tous ? (
                    'toute la ligue'
                  ) : (
                    o.beneficiaires.join(' et ')
                  )}
                </span>
                {o.chance > 0 && (
                  <span className="num text-xs text-faint">{libelleMultiplicateur(o.chance)}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ------------------------------ Les taux ---------------------------- */}
      {estAdmin && (
        <div className="space-y-4">
          <div>
            <h3 className="font-display text-base font-black tracking-wide text-ice uppercase">
              Taux de rareté
            </h3>
            <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-faint">
              La table qui sert au tirage, appliquée par le serveur. Elle s’exprime sur{' '}
              <strong className="text-ink">{flakes(WEIGHT_TOTAL)}</strong> et doit totaliser
              exactement ce nombre : c’est la plage dans laquelle le tirage pioche.
            </p>
          </div>
          {packs.map((p) => (
            <EditeurPack
              key={p.id}
              pack={p}
              busy={busy === p.id}
              onEnvoi={(weights) =>
                envoie('/api/admin/packs', { packId: p.id, weights }, { cle: p.id, methode: 'PATCH' })
              }
            />
          ))}
        </div>
      )}
    </Ecran>
  );
}

/* ------------------------------- La scène -------------------------------- */

function Scene({
  scene,
  pack,
  revele,
  onRevele,
  onFerme,
}: {
  scene: { ouverture: OuvertureVue; anime: boolean };
  pack: PackAdmin | undefined;
  revele: boolean;
  onRevele: () => void;
  onFerme: () => void;
}) {
  const o = scene.ouverture;
  const gagnante = useMemo<CarteRailPack>(
    () => ({
      cardId: o.cardId,
      name: o.nom,
      rarity: o.rarity,
      glyph: o.glyph,
      description: o.description,
      power: o.power,
      nature: o.nature,
    }),
    [o],
  );
  const pool = useMemo(() => pack?.cartes ?? [gagnante], [pack, gagnante]);
  const poids = pack?.weights ?? {};

  return (
    <>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <p className="eyebrow">
          {o.pack}
          {o.pseudo ? ` — pour ${o.pseudo}` : ` — pour ${pack?.pourQui ?? 'la ligue'}`}
        </p>
        {revele && (
          <button type="button" className="btn btn-sm" onClick={onFerme}>
            Suivant
          </button>
        )}
      </div>

      {!revele ? (
        <RailPack
          key={o.id}
          pool={pool}
          poids={poids}
          gagnante={gagnante}
          duree={scene.anime ? COURBE_MESUREE.duree : 0}
          onFini={onRevele}
        />
      ) : (
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start sm:justify-center">
          <div className="w-[190px] shrink-0">
            <CardFrame
              cardId={o.cardId}
              name={o.nom}
              description={o.description}
              rarity={o.rarity}
              glyph={o.glyph}
              power={o.power}
              nature={o.nature}
            />
          </div>
          <div className="max-w-md text-center sm:text-left">
            <RarityChip rarity={o.rarity} />
            <h3
              className="mt-2 font-display text-[28px] leading-none font-black"
              style={{ color: rarityMeta(o.rarity).color }}
            >
              {o.nom}
            </h3>
            <p className="mt-2 text-[15px] text-ink-2">{o.description}</p>
            <Notice kind={o.nature === 'malus' ? 'error' : 'success'}>
              {o.pseudo ? (
                <>
                  Posée sur la prochaine game de <strong>{o.pseudo}</strong>.
                </>
              ) : o.tous ? (
                <>Posée sur la prochaine game de <strong>chaque joueur actif</strong>.</>
              ) : (
                <>
                  Posée sur la prochaine game de <strong>{o.beneficiaires.join(' et ')}</strong>.
                </>
              )}
            </Notice>
          </div>
        </div>
      )}
    </>
  );
}

/* ----------------------------- L'éditeur --------------------------------- */

function EditeurPack({
  pack,
  busy,
  onEnvoi,
}: {
  pack: PackAdmin;
  busy: boolean;
  onEnvoi: (weights: Record<string, number> | null) => Promise<Record<string, unknown> | null>;
}) {
  const [poids, setPoids] = useState<Record<string, number>>({ ...pack.weights });
  const somme = RARITIES.reduce((total, r) => total + (poids[r] ?? 0), 0);
  const ecart = somme - WEIGHT_TOTAL;

  return (
    <div className="glass p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="font-display text-base font-black tracking-wide text-ink">
          {pack.name}
          {pack.modifie && <span className="ml-2 badge text-[11px]">réglé</span>}
        </h4>
        <span className="text-[13px] text-faint">{pack.declencheur}</span>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {RARITIES.map((r) => (
          <label key={r} className="block">
            <span className="mb-1 flex items-center gap-1.5">
              <RarityChip rarity={r} />
              <span className="text-[12px] text-muted">{rarityMeta(r).short}</span>
            </span>
            <input
              type="number"
              className="field num"
              min={0}
              value={poids[r] ?? 0}
              onChange={(e) => setPoids({ ...poids, [r]: Number(e.target.value) })}
            />
            <span className="num mt-0.5 block text-[13px]" style={{ color: rarityMeta(r).color }}>
              {(((poids[r] ?? 0) / WEIGHT_TOTAL) * 100).toFixed(2)} %
            </span>
          </label>
        ))}
      </div>

      <p className={`num mt-2 text-[13px] ${ecart === 0 ? 'text-aurora' : 'text-danger'}`}>
        {ecart === 0
          ? `Somme : ${flakes(somme)} — juste.`
          : `Somme : ${flakes(somme)} — il y a ${flakes(Math.abs(ecart))} ${ecart > 0 ? 'de trop' : 'de moins'}.`}
      </p>

      <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-white/10 pt-3">
        {pack.modifie && (
          <button
            className="btn btn-sm"
            disabled={busy}
            onClick={() => onEnvoi(null)}
            title="Revenir à la table du catalogue"
          >
            Réinitialiser
          </button>
        )}
        <button
          className="btn btn-sm btn-ice"
          disabled={busy || ecart !== 0}
          onClick={() => onEnvoi(poids)}
        >
          {busy ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>
    </div>
  );
}
