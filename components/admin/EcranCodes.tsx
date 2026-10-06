'use client';

import { useState } from 'react';
import { useAction } from '@/components/admin/action';
import { EcranAdmin, Filtres, Panneau, Pastille, Tableau, parNombre, parTexte } from '@/components/admin/Kit';
import { IconCorbeille, IconInterdit } from '@/components/icons';
import { flakes } from '@/components/ui';
import { UTILISATIONS_MAX } from '@/lib/domain/codes';
import { ECONOMY } from '@/lib/domain/rules';
import { shortDateTime } from '@/lib/format';

export interface LigneCode {
  id: string;
  code: string;
  montant: number;
  utilisations: number;
  utilisationsMax: number;
  etat: 'actif' | 'epuise' | 'desactive';
  creeLe: string;
  /** Le pseudo de qui l'a créé. */
  createur: string;
}

const ETAT: Record<LigneCode['etat'], { nom: string; ton: 'aurore' | 'gris' | 'danger' }> = {
  actif: { nom: 'actif', ton: 'aurore' },
  epuise: { nom: 'épuisé', ton: 'gris' },
  desactive: { nom: 'désactivé', ton: 'danger' },
};

/** Des montants qu'on donne souvent, d'un clic. */
const MONTANTS = [50, 100, 250, 500, 1000];

/**
 * Les codes cadeaux : c'est ainsi que les flocons se donnent.
 *
 * Un montant, un nombre de joueurs, et un code tiré au sort, aussitôt annoncé
 * dans le tchat. Chaque joueur le tape une fois, derrière le cadeau près de son
 * solde ; celui qui crée un code ne peut pas s'en servir. Désactivé ou
 * supprimé, un code ne sert plus — ce qu'il a versé reste versé, et le journal
 * garde la trace.
 */
export function EcranCodes({ codes }: { codes: LigneCode[] }) {
  const { busy, message, envoie, setMessage } = useAction();
  const [montant, setMontant] = useState(100);
  const [utilisationsMax, setUtilisationsMax] = useState(10);
  const [dernier, setDernier] = useState<{ code: string; annonce: boolean } | null>(null);
  const [aSupprimer, setASupprimer] = useState<string | null>(null);
  const [filtre, setFiltre] = useState<'actifs' | 'tous'>('actifs');

  async function copie(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setMessage({ kind: 'success', text: `${code} copié.` });
    } catch {
      setMessage({ kind: 'error', text: 'Copie impossible : sélectionne le code à la main.' });
    }
  }

  async function cree() {
    const data = await envoie(
      '/api/admin/codes',
      { montant, utilisationsMax },
      { cle: 'code-cree', succes: 'Code créé.' },
    );
    if (!data) return;
    const code = String(data.code);
    const tchat = data.tchat as { envoye?: boolean; detail?: string } | undefined;
    const annonce = tchat?.envoye === true;
    setDernier({ code, annonce });
    setMessage(
      annonce
        ? { kind: 'success', text: `Code ${code} créé et annoncé dans le tchat.` }
        : {
            kind: 'error',
            text: `Code ${code} créé, mais Twitch a refusé l’annonce dans le tchat${tchat?.detail ? ` (${tchat.detail})` : ''} : annonce-le toi-même.`,
          },
    );
  }

  async function supprime(c: LigneCode) {
    const fait = await envoie(
      '/api/admin/codes',
      { id: c.id },
      { methode: 'DELETE', cle: `code:${c.id}`, succes: `${c.code} supprimé. Les flocons déjà versés restent.` },
    );
    setASupprimer(null);
    if (fait && dernier?.code === c.code) setDernier(null);
  }

  const actifs = codes.filter((c) => c.etat === 'actif');
  const lignes = filtre === 'actifs' ? actifs : codes;

  return (
    <EcranAdmin
      intro="Les flocons se donnent par des codes : la modération en crée un, le tchat le reçoit, chaque joueur le tape une fois."
      grille="codes"
      message={message}
      onFermeMessage={() => setMessage(null)}
    >
      <Panneau
        zone="creer"
        ton="or"
        icone="cadeau"
        titre="Créer un code"
        sousTitre="Il est tiré au sort et annoncé dans le tchat."
      >
        <form
          className="adm-form"
          onSubmit={(e) => {
            e.preventDefault();
            void cree();
          }}
        >
          <label className="adm-champ">
            <span>Flocons pour chaque joueur</span>
            <input
              type="number"
              className="field num"
              min={1}
              max={ECONOMY.soldeMax}
              value={Number.isFinite(montant) ? montant : ''}
              onChange={(e) => setMontant(Math.floor(Number(e.target.value)))}
              required
            />
          </label>
          <div className="adm-rapides" role="group" aria-label="Montants rapides">
            {MONTANTS.map((m) => (
              <button key={m} type="button" aria-pressed={montant === m} onClick={() => setMontant(m)}>
                {flakes(m)}
              </button>
            ))}
          </div>
          <label className="adm-champ">
            <span>Combien de joueurs peuvent le taper</span>
            <input
              type="number"
              className="field num"
              min={1}
              max={UTILISATIONS_MAX}
              value={Number.isFinite(utilisationsMax) ? utilisationsMax : ''}
              onChange={(e) => setUtilisationsMax(Math.floor(Number(e.target.value)))}
              required
            />
          </label>
          <p className="adm-note">
            Au total : jusqu’à <b>{flakes((montant || 0) * (utilisationsMax || 0))} ❄</b> distribués.
          </p>
          <button className="btn btn-ice w-full" disabled={busy !== null || !(montant >= 1) || !(utilisationsMax >= 1)}>
            Créer et annoncer le code
          </button>
        </form>

        {dernier && (
          <div className="adm-code-cree">
            <div className="min-w-0">
              <span>{dernier.annonce ? 'Annoncé dans le tchat' : 'À annoncer toi-même'}</span>
              <strong>{dernier.code}</strong>
            </div>
            <button type="button" className="btn btn-sm" onClick={() => copie(dernier.code)}>
              Copier
            </button>
          </div>
        )}
      </Panneau>

      <Panneau
        zone="liste"
        icone="snowflake"
        titre="Les codes"
        sousTitre="Un clic sur un code le copie. Désactivé ou supprimé, il ne sert plus ; ce qu’il a versé reste versé."
        defile
        actions={
          <Filtres
            valeur={filtre}
            onChange={setFiltre}
            options={[
              { cle: 'actifs', nom: 'Actifs', compte: actifs.length },
              { cle: 'tous', nom: 'Tous', compte: codes.length },
            ]}
          />
        }
      >
        <Tableau
          lignes={lignes}
          cleDe={(c) => c.id}
          triDefaut={{ cle: 'cree', desc: true }}
          vide={filtre === 'actifs' ? 'Aucun code actif.' : 'Aucun code pour l’instant.'}
          colonnes={[
            {
              cle: 'code',
              titre: 'Code',
              principale: true,
              largeur: 'minmax(0, 1.3fr)',
              tri: parTexte((c) => c.code),
              rendu: (c) => (
                <span className="adm-code">
                  <button type="button" title="Copier le code" onClick={() => copie(c.code)}>
                    {c.code}
                  </button>
                  <small>
                    par {c.createur} · {shortDateTime(c.creeLe)}
                  </small>
                </span>
              ),
            },
            {
              cle: 'montant',
              titre: 'Flocons',
              align: 'droite',
              largeur: '6.5rem',
              tri: parNombre((c) => c.montant),
              rendu: (c) => <b className="num text-ice">{flakes(c.montant)} ❄</b>,
            },
            {
              cle: 'utilisations',
              titre: 'Utilisé',
              align: 'droite',
              largeur: '6.5rem',
              tri: parNombre((c) => c.utilisations),
              rendu: (c) => (
                <span className="num">
                  {c.utilisations} / {c.utilisationsMax}
                </span>
              ),
            },
            {
              cle: 'etat',
              titre: 'État',
              largeur: '7rem',
              tri: parTexte((c) => c.etat),
              rendu: (c) => <Pastille ton={ETAT[c.etat].ton}>{ETAT[c.etat].nom}</Pastille>,
            },
            {
              cle: 'cree',
              titre: 'Gestes',
              align: 'droite',
              largeur: '9rem',
              tri: parTexte((c) => c.creeLe),
              rendu: (c) =>
                aSupprimer === c.id ? (
                  <span className="adm-confirme" role="group" aria-label={`Supprimer ${c.code} pour de bon ?`}>
                    <button type="button" data-danger="" disabled={busy !== null} onClick={() => supprime(c)}>
                      Supprimer
                    </button>
                    <button type="button" disabled={busy !== null} onClick={() => setASupprimer(null)}>
                      Non
                    </button>
                  </span>
                ) : (
                  <span className="adm-gestes">
                    {c.etat === 'actif' && (
                      <button
                        type="button"
                        disabled={busy !== null}
                        title="Désactiver : le code ne sert plus, ce qu’il a versé reste versé"
                        aria-label={`Désactiver ${c.code}`}
                        onClick={() =>
                          envoie(
                            '/api/admin/codes',
                            { id: c.id },
                            { methode: 'PATCH', cle: `code:${c.id}`, succes: `${c.code} désactivé.` },
                          )
                        }
                      >
                        <IconInterdit className="h-[18px] w-[18px]" />
                      </button>
                    )}
                    <button
                      type="button"
                      data-danger=""
                      disabled={busy !== null}
                      title="Supprimer ce code"
                      aria-label={`Supprimer ${c.code}`}
                      onClick={() => setASupprimer(c.id)}
                    >
                      <IconCorbeille className="h-[18px] w-[18px]" />
                    </button>
                  </span>
                ),
            },
          ]}
        />
      </Panneau>
    </EcranAdmin>
  );
}
