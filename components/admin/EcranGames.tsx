'use client';

import { useState } from 'react';
import { useAction } from '@/components/admin/action';
import { Bloc, Ecran } from '@/components/admin/Cadre';
import { EmptyState, flakes } from '@/components/ui';
import { GAME_LIMITS } from '@/lib/domain/rules';
import { shortDateTime } from '@/lib/format';

export interface OptionJoueur {
  id: string;
  pseudo: string;
  games: number;
  snowflakes: number;
}

export interface LigneGame {
  id: string;
  pseudo: string;
  kills: number;
  placement: number | null;
  bonusPoints: number;
  score: number;
  playedAt: string;
  note: string | null;
}

/**
 * Saisie des games, et les dernières enregistrées.
 *
 * Les deux vont ensemble : la seule vérification possible après une saisie est
 * de relire la ligne qu'on vient de créer. Séparer le formulaire du tableau
 * obligerait à changer d'écran pour vérifier une faute de frappe, ce qui revient
 * à ne pas vérifier.
 */
export function EcranGames({
  joueurs,
  recentes,
}: {
  joueurs: OptionJoueur[];
  recentes: LigneGame[];
}) {
  const { busy, message, envoie } = useAction();
  const [joueur, setJoueur] = useState('');
  const [kills, setKills] = useState(0);
  const [placement, setPlacement] = useState<'' | '1' | '2' | '3'>('');
  const [note, setNote] = useState('');

  return (
    <Ecran
      titre="Games"
      lead={
        <>
          Ni multiplicateur ni bonus ici : ils ne peuvent venir que d’une carte jouée par le joueur
          lui-même. Le score et les flocons sont calculés par le serveur à partir des kills et du
          classement.
        </>
      }
      message={message}
    >
      <Bloc titre="Saisir une game">
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const fait = await envoie('/api/games', {
              playerId: joueur,
              kills,
              placement: placement === '' ? null : (Number(placement) as 1 | 2 | 3),
              note: note || null,
            });
            if (fait) {
              setKills(0);
              setPlacement('');
              setNote('');
            }
          }}
        >
          <div className="sm:col-span-2">
            <label className="label" htmlFor="game-joueur">
              Joueur
            </label>
            <select
              id="game-joueur"
              className="field"
              value={joueur}
              onChange={(e) => setJoueur(e.target.value)}
              required
            >
              <option value="">— Choisir —</option>
              {joueurs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.pseudo} ({p.games} games)
                </option>
              ))}
            </select>
          </div>

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

          <div className="sm:col-span-2">
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

          <div className="sm:col-span-2">
            <button className="btn btn-ice w-full" disabled={busy !== null || !joueur}>
              {busy ? 'Enregistrement…' : 'Enregistrer la game'}
            </button>
          </div>
        </form>
      </Bloc>

      <section className="glass">
        <h3 className="border-b border-white/10 px-4 py-2.5 font-display text-sm font-black tracking-wider text-ink uppercase">
          Dernières games
        </h3>
        {recentes.length === 0 ? (
          <div className="p-4">
            <EmptyState title="Aucune game" hint="La première saisie apparaîtra ici." />
          </div>
        ) : (
          <div className="scroll-x">
            <table className="grid-table min-w-[640px]">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Joueur</th>
                  <th className="text-right">Kills</th>
                  <th className="text-right">Top</th>
                  <th className="text-right">Cartes</th>
                  <th className="text-right">Score</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {recentes.map((g) => (
                  <tr key={g.id}>
                    <td className="text-xs whitespace-nowrap text-faint">
                      {shortDateTime(g.playedAt)}
                    </td>
                    <td className="text-ink">{g.pseudo}</td>
                    <td className="num text-right text-muted">{g.kills}</td>
                    <td className="num text-right text-muted">{g.placement ?? '—'}</td>
                    <td
                      className={`num text-right ${g.bonusPoints > 0 ? 'text-aurora' : g.bonusPoints < 0 ? 'text-danger' : 'text-faint'}`}
                    >
                      {g.bonusPoints === 0 ? '—' : g.bonusPoints > 0 ? `+${g.bonusPoints}` : g.bonusPoints}
                    </td>
                    <td className="num text-right font-bold text-ice">{flakes(g.score)}</td>
                    <td className="text-xs text-muted">{g.note ?? ''}</td>
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
