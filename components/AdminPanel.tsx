'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Notice, flakes } from '@/components/ui';
import { CARDS } from '@/lib/domain/catalog';
import { GAME_LIMITS, SUBS, nextMilestone } from '@/lib/domain/rules';

export interface AdminPlayer {
  id: string;
  pseudo: string;
  slug: string;
  snowflakes: number;
  games: number;
  score: number;
}

export interface AdminConfig {
  maxGamesPerPlayer: number;
  shopOpen: boolean;
  marketOpen: boolean;
  totalSubs: number;
}

/**
 * Panneau de modération.
 *
 * Aucune de ces actions n'est autorisée par le fait que le composant s'affiche :
 * chaque route revérifie la session admin. Le panneau est une commodité, pas un
 * contrôle d'accès.
 */
export function AdminPanel({
  players,
  config,
  auditTrail,
}: {
  players: AdminPlayer[];
  config: AdminConfig;
  auditTrail: { at: string; actor: string; action: string; detail: string }[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);

  // Saisie d'une game
  const [gamePlayer, setGamePlayer] = useState('');
  const [kills, setKills] = useState(0);
  const [placement, setPlacement] = useState<'' | '1' | '2' | '3'>('');
  const [note, setNote] = useState('');

  // Inscription
  const [pseudo, setPseudo] = useState('');
  const [twitchLogin, setTwitchLogin] = useState('');

  // Attribution
  const [grantPlayer, setGrantPlayer] = useState('');
  const [grantFlakes, setGrantFlakes] = useState(0);
  const [grantCard, setGrantCard] = useState('');
  const [grantReason, setGrantReason] = useState('');

  // Réglages
  const [maxGames, setMaxGames] = useState(config.maxGamesPerPlayer);

  // Subs
  const [giftPlayer, setGiftPlayer] = useState('');
  const [lastDrop, setLastDrop] = useState<string | null>(null);

  async function call(path: string, body: unknown, method = 'POST') {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(path, {
        method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = await response.json();
      if (!payload.ok) {
        setMessage({ kind: 'error', text: payload.error?.message ?? 'Action refusée.' });
        return false;
      }
      setMessage({ kind: 'success', text: 'Enregistré.' });
      router.refresh();
      return true;
    } catch {
      setMessage({ kind: 'error', text: 'Le serveur n’a pas répondu.' });
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function submitGame(event: React.FormEvent) {
    event.preventDefault();
    const done = await call('/api/games', {
      playerId: gamePlayer,
      kills,
      placement: placement === '' ? null : (Number(placement) as 1 | 2 | 3),
      note: note || null,
    });
    if (done) {
      setKills(0);
      setPlacement('');
      setNote('');
    }
  }

  return (
    <div className="space-y-6">
      {message && <Notice kind={message.kind}>{message.text}</Notice>}

      <SubsPanel
        config={config}
        players={players}
        busy={busy}
        giftPlayer={giftPlayer}
        setGiftPlayer={setGiftPlayer}
        lastDrop={lastDrop}
        onSubs={async (delta) => {
          setBusy(true);
          setMessage(null);
          try {
            const response = await fetch('/api/admin/subs', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ action: 'subs', delta }),
            });
            const payload = await response.json();
            if (!payload.ok) {
              setMessage({ kind: 'error', text: payload.error?.message ?? 'Action refusée.' });
              return;
            }
            const d = payload.data;
            setLastDrop(
              d.milestones.length === 0
                ? `+${delta} subs — aucun palier franchi`
                : `${d.milestones.join(', ')} — ${d.snowflakesEach} ❄${
                    d.boostersEach.length ? ` + ${d.boostersEach.length} booster(s)` : ''
                  } pour ${d.recipients} joueur(s)`,
            );
            setMessage({ kind: 'success', text: 'Subs enregistrés.' });
            router.refresh();
          } catch {
            setMessage({ kind: 'error', text: 'Le serveur n’a pas répondu.' });
          } finally {
            setBusy(false);
          }
        }}
        onGift={async () => {
          const done = await call('/api/admin/subs', { action: 'gift', playerId: giftPlayer });
          if (done) setGiftPlayer('');
        }}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        {/* --------------------------- Saisir une game -------------------- */}
        <section className="panel panel-frost p-5">
          <h2 className="font-display text-lg font-black uppercase tracking-wide text-ice">
            Saisir une game
          </h2>
          <p className="mt-1 text-xs text-faint">
            Ni multiplicateur ni bonus ici&nbsp;: ils ne peuvent venir que d’une carte jouée par le
            joueur. Le score et les flocons sont calculés par le serveur.
          </p>
          <form className="mt-4 space-y-3" onSubmit={submitGame}>
            <div>
              <label className="label" htmlFor="game-joueur">
                Joueur
              </label>
              <select
                id="game-joueur"
                className="field"
                value={gamePlayer}
                onChange={(e) => setGamePlayer(e.target.value)}
                required
              >
                <option value="">— Choisir —</option>
                {players.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.pseudo} ({p.games} games)
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label" htmlFor="game-kills">
                  Kills
                </label>
                <input
                  id="game-kills"
                  type="number"
                  className="field num"
                  min={GAME_LIMITS.minKills}
                  max={GAME_LIMITS.maxKills}
                  value={kills}
                  onChange={(e) => setKills(Number(e.target.value))}
                  required
                />
              </div>
              <div>
                <label className="label" htmlFor="game-top">
                  Classement
                </label>
                <select
                  id="game-top"
                  className="field"
                  value={placement}
                  onChange={(e) => setPlacement(e.target.value as '' | '1' | '2' | '3')}
                >
                  <option value="">Aucun</option>
                  <option value="1">Top 1 (+20)</option>
                  <option value="2">Top 2 (+15)</option>
                  <option value="3">Top 3 (+8)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="label" htmlFor="game-note">
                Note (facultatif)
              </label>
              <input
                id="game-note"
                className="field"
                maxLength={140}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Ex. : game 3 du live"
              />
            </div>

            <button className="btn btn-ice w-full" disabled={busy || !gamePlayer}>
              Enregistrer la game
            </button>
          </form>
        </section>

        {/* ---------------------------- Inscription ----------------------- */}
        <section className="panel panel-frost p-5">
          <h2 className="font-display text-lg font-black uppercase tracking-wide text-ice">
            Inscrire un joueur
          </h2>
          <p className="mt-1 text-xs text-faint">
            En attendant la connexion Twitch. Le joueur reçoit sa dotation de départ.
          </p>
          <form
            className="mt-4 space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              const done = await call('/api/players', {
                pseudo,
                twitchLogin: twitchLogin || null,
              });
              if (done) {
                setPseudo('');
                setTwitchLogin('');
              }
            }}
          >
            <div>
              <label className="label" htmlFor="new-pseudo">
                Pseudo
              </label>
              <input
                id="new-pseudo"
                className="field"
                value={pseudo}
                onChange={(e) => setPseudo(e.target.value)}
                minLength={2}
                maxLength={24}
                required
              />
            </div>
            <div>
              <label className="label" htmlFor="new-twitch">
                Chaîne Twitch (facultatif)
              </label>
              <input
                id="new-twitch"
                className="field"
                value={twitchLogin}
                onChange={(e) => setTwitchLogin(e.target.value)}
                pattern="[a-zA-Z0-9_]{3,25}"
                placeholder="pseudo_twitch"
              />
            </div>
            <button className="btn btn-ice w-full" disabled={busy || pseudo.length < 2}>
              Inscrire
            </button>
          </form>
        </section>

        {/* ---------------------------- Attribution ----------------------- */}
        <section className="panel panel-frost p-5">
          <h2 className="font-display text-lg font-black uppercase tracking-wide text-ice">
            Attribuer flocons ou carte
          </h2>
          <p className="mt-1 text-xs text-faint">
            Chaque attribution exige un motif et laisse une trace au journal.
          </p>
          <form
            className="mt-4 space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              const done = await call('/api/admin/grant', {
                playerId: grantPlayer,
                ...(grantFlakes !== 0 ? { snowflakes: grantFlakes } : {}),
                ...(grantCard ? { cardId: grantCard } : {}),
                reason: grantReason,
              });
              if (done) {
                setGrantFlakes(0);
                setGrantCard('');
                setGrantReason('');
              }
            }}
          >
            <div>
              <label className="label" htmlFor="grant-joueur">
                Joueur
              </label>
              <select
                id="grant-joueur"
                className="field"
                value={grantPlayer}
                onChange={(e) => setGrantPlayer(e.target.value)}
                required
              >
                <option value="">— Choisir —</option>
                {players.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.pseudo} — ❄ {flakes(p.snowflakes)}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label" htmlFor="grant-flocons">
                  Flocons (± )
                </label>
                <input
                  id="grant-flocons"
                  type="number"
                  className="field num"
                  value={grantFlakes}
                  onChange={(e) => setGrantFlakes(Number(e.target.value))}
                />
              </div>
              <div>
                <label className="label" htmlFor="grant-carte">
                  Carte
                </label>
                <select
                  id="grant-carte"
                  className="field"
                  value={grantCard}
                  onChange={(e) => setGrantCard(e.target.value)}
                >
                  <option value="">Aucune</option>
                  {CARDS.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="label" htmlFor="grant-motif">
                Motif
              </label>
              <input
                id="grant-motif"
                className="field"
                maxLength={140}
                value={grantReason}
                onChange={(e) => setGrantReason(e.target.value)}
                required
                placeholder="Ex. : lot du défi du samedi"
              />
            </div>
            <button
              className="btn btn-ice w-full"
              disabled={
                busy || !grantPlayer || !grantReason || (grantFlakes === 0 && grantCard === '')
              }
            >
              Attribuer
            </button>
          </form>
        </section>

        {/* ------------------------------ Réglages ------------------------ */}
        <section className="panel panel-frost p-5">
          <h2 className="font-display text-lg font-black uppercase tracking-wide text-ice">
            Réglages de saison
          </h2>
          <div className="mt-4 space-y-3">
            <div>
              <label className="label" htmlFor="max-games">
                Limite de games par joueur
              </label>
              <div className="flex gap-2">
                <input
                  id="max-games"
                  type="number"
                  className="field num"
                  min={1}
                  max={100}
                  value={maxGames}
                  onChange={(e) => setMaxGames(Number(e.target.value))}
                />
                <button
                  className="btn shrink-0"
                  disabled={busy}
                  onClick={() =>
                    call('/api/admin/config', { maxGamesPerPlayer: maxGames }, 'PATCH')
                  }
                >
                  Appliquer
                </button>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                className={`btn flex-1 ${config.shopOpen ? '' : 'btn-danger'}`}
                disabled={busy}
                onClick={() => call('/api/admin/config', { shopOpen: !config.shopOpen }, 'PATCH')}
              >
                Boutique&nbsp;: {config.shopOpen ? 'ouverte' : 'fermée'}
              </button>
              <button
                className={`btn flex-1 ${config.marketOpen ? '' : 'btn-danger'}`}
                disabled={busy}
                onClick={() =>
                  call('/api/admin/config', { marketOpen: !config.marketOpen }, 'PATCH')
                }
              >
                Ventes&nbsp;: {config.marketOpen ? 'ouvertes' : 'fermées'}
              </button>
            </div>

            <div className="border-t border-line pt-3">
              <p className="label">Sauvegarde</p>
              <a href="/api/admin/backup" className="btn btn-sm no-underline">
                Exporter la base (JSON)
              </a>
              <p className="mt-1.5 text-xs text-faint">
                À conserver avant toute manipulation. La restauration se fait par POST sur la même
                route.
              </p>
            </div>
          </div>
        </section>
      </div>

      {/* ------------------------------- Joueurs -------------------------- */}
      <section className="panel panel-frost">
        <h2 className="border-b border-line px-4 py-2.5 font-display text-sm font-black uppercase tracking-wider text-ink">
          Joueurs inscrits
        </h2>
        <div className="scroll-x">
          <table className="grid-table min-w-[520px]">
            <thead>
              <tr>
                <th>Joueur</th>
                <th className="text-right">Games</th>
                <th className="text-right">Points</th>
                <th className="text-right">Flocons</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {players.map((p) => (
                <tr key={p.id}>
                  <td className="text-ink">{p.pseudo}</td>
                  <td className="num text-right text-muted">{p.games}</td>
                  <td className="num text-right text-ice">{p.score}</td>
                  <td className="num text-right text-faint">❄ {flakes(p.snowflakes)}</td>
                  <td className="text-right">
                    <a href={`/joueurs/${p.slug}`} className="btn btn-sm no-underline">
                      Profil
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ------------------------------- Journal -------------------------- */}
      <section className="panel panel-frost">
        <h2 className="border-b border-line px-4 py-2.5 font-display text-sm font-black uppercase tracking-wider text-ink">
          Journal d’audit
        </h2>
        <div className="scroll-x">
          <table className="grid-table min-w-[600px]">
            <thead>
              <tr>
                <th>Date</th>
                <th>Acteur</th>
                <th>Action</th>
                <th>Détail</th>
              </tr>
            </thead>
            <tbody>
              {auditTrail.map((entry, i) => (
                <tr key={i}>
                  <td className="whitespace-nowrap text-xs text-faint">
                    {new Date(entry.at).toLocaleString('fr-FR', {
                      day: '2-digit',
                      month: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </td>
                  <td className="text-xs text-muted">{entry.actor.slice(0, 8)}</td>
                  <td className="text-xs text-ink">{entry.action.replaceAll('_', ' ')}</td>
                  <td className="text-xs text-muted">{entry.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------------ */

/**
 * Compteur de subs.
 *
 * Deux actions bien distinctes, et la distinction est volontairement visible :
 * ajouter des subs verse à *tous* les joueurs actifs, tandis que la carte
 * offerte vise un joueur nommé — mais ne donne jamais de flocons.
 */
function SubsPanel({
  config,
  players,
  busy,
  giftPlayer,
  setGiftPlayer,
  lastDrop,
  onSubs,
  onGift,
}: {
  config: AdminConfig;
  players: AdminPlayer[];
  busy: boolean;
  giftPlayer: string;
  setGiftPlayer: (id: string) => void;
  lastDrop: string | null;
  onSubs: (delta: number) => void;
  onGift: () => void;
}) {
  const next = nextMilestone(config.totalSubs);

  return (
    <section className="panel panel-frost p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-black tracking-wide text-ice uppercase">
            Compteur de subs
          </h2>
          <p className="mt-0.5 text-xs text-faint">
            Chaque palier verse à <strong className="text-muted">tous les joueurs actifs</strong>,
            à parts égales. Aucun versement ne peut viser un joueur en particulier.
          </p>
        </div>
        <div className="text-right">
          <div className="num font-display text-3xl leading-none font-black text-violet">
            {flakes(config.totalSubs)}
          </div>
          {next && (
            <div className="text-[11px] text-faint">
              {next.milestone.label} dans {next.remaining} sub{next.remaining > 1 ? 's' : ''}
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {SUBS.adminSteps.map((step) => (
          <button
            key={step}
            className="btn btn-sm"
            disabled={busy}
            onClick={() => onSubs(step)}
          >
            +{step}
          </button>
        ))}
      </div>

      {lastDrop && (
        <p className="mt-3 rounded-lg border border-aurora/40 bg-aurora/5 px-3 py-2 text-xs text-aurora">
          {lastDrop}
        </p>
      )}

      <div className="mt-4 border-t border-line pt-3">
        <p className="label">Carte offerte par un gifteur ({SUBS.giftThreshold} subs)</p>
        <div className="flex flex-wrap gap-2">
          <select
            className="field flex-1"
            value={giftPlayer}
            onChange={(e) => setGiftPlayer(e.target.value)}
          >
            <option value="">— Joueur désigné —</option>
            {players.map((p) => (
              <option key={p.id} value={p.id}>
                {p.pseudo}
              </option>
            ))}
          </select>
          <button className="btn shrink-0" disabled={busy || !giftPlayer} onClick={onGift}>
            Offrir une commune
          </button>
        </div>
        <p className="mt-1.5 text-[11px] text-faint">
          Toujours une commune, jamais des flocons : le geste passe à l’antenne sans peser sur le
          classement. Maximum {SUBS.maxGiftedCardsPerDay} par joueur et par jour.
        </p>
      </div>
    </section>
  );
}
