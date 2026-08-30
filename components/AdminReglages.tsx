'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Notice, RarityChip, flakes, rarityMeta } from '@/components/ui';
import { WEIGHT_TOTAL } from '@/lib/domain/rules';
import { RARITIES, type Rarity } from '@/lib/domain/types';

export interface ReglageJoueur {
  id: string;
  pseudo: string;
  role: 'joueur' | 'moderateur' | 'admin';
}

export interface ReglageBooster {
  id: string;
  name: string;
  price: number;
  weights: Record<Rarity, number>;
  slots: { effet: number; collection: number };
  /** Vrai si un réglage recouvre le catalogue pour ce booster. */
  modifie: boolean;
}

const ROLES: { id: ReglageJoueur['role']; label: string; aide: string }[] = [
  { id: 'joueur', label: 'Joueur', aide: 'Participe, rien de plus.' },
  {
    id: 'moderateur',
    label: 'Modérateur',
    aide: 'Saisit les games, crédite, ouvre et ferme la boutique.',
  },
  {
    id: 'admin',
    label: 'Admin',
    aide: 'Tout cela, plus les prix, les taux et les rôles.',
  },
];

/**
 * Réglages réservés à l'administration : les rôles, et l'économie des boosters.
 *
 * Séparé du panneau de modération, et pas seulement pour la longueur du
 * fichier : ce qui se règle ici change les **règles** de la saison, quand le
 * reste ne fait que la faire vivre. La frontière est la même que côté serveur —
 * `role: 'admin'` sur ces deux routes, `role: 'moderateur'` sur les autres — et
 * la voir dans l'interface aide à comprendre pourquoi on donne l'un plutôt que
 * l'autre.
 *
 * Aucune de ces actions n'est autorisée par le fait que le composant s'affiche :
 * chaque route revérifie la session. C'est une commodité, pas un contrôle
 * d'accès.
 */
export function AdminReglages({
  joueurs,
  boosters,
}: {
  joueurs: ReglageJoueur[];
  boosters: ReglageBooster[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);

  async function envoie(path: string, body: Record<string, unknown>, cle: string) {
    setBusy(cle);
    setMessage(null);
    try {
      const reponse = await fetch(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const charge = await reponse.json();
      if (!charge.ok) {
        setMessage({ kind: 'error', text: charge.error?.message ?? 'Action refusée.' });
        return false;
      }
      setMessage({ kind: 'success', text: 'Enregistré.' });
      router.refresh();
      return true;
    } catch {
      setMessage({ kind: 'error', text: 'Le serveur n’a pas répondu.' });
      return false;
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      {message && <Notice kind={message.kind}>{message.text}</Notice>}

      {/* ------------------------------ Les rôles ------------------------- */}
      <section className="glass">
        <div className="border-b border-white/10 px-4 py-3">
          <h2 className="font-display text-sm font-black tracking-wider text-ink uppercase">
            Rôles
          </h2>
          <p className="mt-1 text-[13px] text-faint">
            Un modérateur fait vivre la saison ; un administrateur en change les règles. Il doit
            rester au moins un administrateur, et personne ne peut se retirer le sien.
          </p>
        </div>

        <div className="scroll-x">
          <table className="grid-table min-w-[560px]">
            <thead>
              <tr>
                <th>Joueur</th>
                <th>Rôle</th>
                <th className="text-right">Changer</th>
              </tr>
            </thead>
            <tbody>
              {joueurs.map((j) => (
                <tr key={j.id}>
                  <td className="text-ink">{j.pseudo}</td>
                  <td>
                    <span
                      className="badge"
                      style={
                        j.role === 'admin'
                          ? { borderColor: 'var(--gold)', color: 'var(--gold)' }
                          : j.role === 'moderateur'
                            ? { borderColor: 'var(--ice)', color: 'var(--ice)' }
                            : undefined
                      }
                    >
                      {ROLES.find((r) => r.id === j.role)?.label ?? j.role}
                    </span>
                  </td>
                  <td className="text-right">
                    <div className="inline-flex gap-1.5">
                      {ROLES.filter((r) => r.id !== j.role).map((r) => (
                        <button
                          key={r.id}
                          className="btn btn-sm"
                          title={r.aide}
                          disabled={busy !== null}
                          onClick={() =>
                            envoie('/api/admin/roles', { playerId: j.id, role: r.id }, j.id)
                          }
                        >
                          {r.label}
                        </button>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ---------------------------- Les boosters ------------------------ */}
      <section className="space-y-3">
        <div>
          <h2 className="font-display text-sm font-black tracking-wider text-ink uppercase">
            Boosters
          </h2>
          <p className="mt-1 text-[13px] text-faint">
            Le prix débité et la table qui sert au tirage. La table doit totaliser exactement{' '}
            <span className="num">{flakes(WEIGHT_TOTAL)}</span> — c’est la plage dans laquelle le
            serveur tire, et une somme fausse rendrait les taux affichés mensongers.
          </p>
        </div>

        {boosters.map((b) => (
          <EditeurBooster
            key={b.id}
            booster={b}
            busy={busy === b.id}
            onEnvoi={(corps) => envoie('/api/admin/boosters', { boosterId: b.id, ...corps }, b.id)}
          />
        ))}
      </section>
    </div>
  );
}

/**
 * L'éditeur d'un booster.
 *
 * La somme des poids est affichée en permanence, et l'enregistrement est refusé
 * tant qu'elle ne tombe pas juste. Le serveur revérifie de toute façon ; l'écart
 * affiché sert à ce qu'on n'ait pas à le calculer de tête à chaque frappe.
 */
function EditeurBooster({
  booster,
  busy,
  onEnvoi,
}: {
  booster: ReglageBooster;
  busy: boolean;
  onEnvoi: (corps: Record<string, unknown>) => Promise<boolean>;
}) {
  const [prix, setPrix] = useState(booster.price);
  const [poids, setPoids] = useState<Record<string, number>>({ ...booster.weights });

  const somme = RARITIES.reduce((total, r) => total + (poids[r] ?? 0), 0);
  const ecart = somme - WEIGHT_TOTAL;
  const juste = ecart === 0;

  return (
    <div className="glass p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-display text-base font-black tracking-wide text-ink">
          {booster.name}
          {booster.modifie && <span className="ml-2 badge text-[11px]">réglé</span>}
        </h3>
        <span className="text-[13px] text-faint">
          {booster.slots.effet} effets + {booster.slots.collection} collection
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-[160px_1fr]">
        <label className="block">
          <span className="label">Prix</span>
          <input
            type="number"
            className="field num"
            min={1}
            value={prix}
            onChange={(e) => setPrix(Number(e.target.value))}
          />
        </label>

        <div>
          <span className="label">Taux de rareté</span>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {RARITIES.map((r) => (
              <label key={r} className="block">
                <span className="mb-1 flex items-center gap-1">
                  <RarityChip rarity={r} />
                  <span className="num text-[11px]" style={{ color: rarityMeta(r).color }}>
                    {(((poids[r] ?? 0) / WEIGHT_TOTAL) * 100).toFixed(2)} %
                  </span>
                </span>
                <input
                  type="number"
                  className="field num"
                  min={0}
                  value={poids[r] ?? 0}
                  onChange={(e) => setPoids({ ...poids, [r]: Number(e.target.value) })}
                />
              </label>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <span className={`num text-[13px] ${juste ? 'text-aurora' : 'text-danger'}`}>
          Somme : {flakes(somme)}
          {!juste && ` — ${ecart > 0 ? '+' : ''}${flakes(ecart)} par rapport à ${flakes(WEIGHT_TOTAL)}`}
        </span>

        <div className="flex gap-2">
          {booster.modifie && (
            <button
              className="btn btn-sm"
              disabled={busy}
              onClick={() => onEnvoi({ price: null, weights: null })}
              title="Revenir aux valeurs du catalogue"
            >
              Réinitialiser
            </button>
          )}
          <button
            className="btn btn-sm btn-ice"
            disabled={busy || !juste}
            onClick={() => onEnvoi({ price: prix, weights: poids })}
          >
            {busy ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  );
}
