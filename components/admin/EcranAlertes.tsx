'use client';

import { useAction } from '@/components/admin/action';
import { EcranAdmin, Panneau } from '@/components/admin/Kit';
import type { AlertesLive } from '@/lib/db/entities';

const REGLAGES: { cle: keyof AlertesLive; titre: string; aide: string }[] = [
  {
    cle: 'tchatBoosters',
    titre: 'Message dans le tchat à chaque booster ouvert',
    aide: 'Le message « Booster ouvert ! … a obtenu la carte … » envoyé dans le tchat de la chaîne.',
  },
];

/**
 * Les alertes du tchat (16/11/2026) : de quoi tester — ouvrir des boosters —
 * pendant que la streameuse est en live, sans rien écrire dans le tchat.
 * L'overlay OBS n'y est pas soumis. Les cartes se règlent quand même : seul le
 * message est coupé.
 */
export function EcranAlertes({ alertes }: { alertes: AlertesLive }) {
  const { busy, message, envoie, setMessage } = useAction();

  function bascule(cle: keyof AlertesLive, valeur: boolean) {
    void envoie(
      '/api/admin/config',
      { alertes: { [cle]: valeur } },
      { methode: 'PATCH', cle, succes: valeur ? 'Rallumé : les messages repartent dans le tchat.' : 'Coupé : plus aucun message de booster dans le tchat.' },
    );
  }

  const coupees = REGLAGES.filter((r) => !alertes[r.cle]).length;

  return (
    <EcranAdmin
      intro="Coupe le message du tchat pour faire tes tests pendant le live : les boosters s’ouvrent pour de vrai, mais rien n’est écrit dans le tchat. L’overlay OBS, lui, n’est pas touché. Les duels n’écrivent rien dans le tchat. Pense à rallumer après."
      grille="seul"
      message={message}
      onFermeMessage={() => setMessage(null)}
    >
      <Panneau
        titre="Alertes du tchat"
        sousTitre={
          coupees === 0
            ? 'Les messages partent dans le tchat.'
            : 'Coupé : aucun message de booster ne part dans le tchat.'
        }
      >
        <ul className="adm-alertes">
          {REGLAGES.map((r) => (
            <li key={r.cle} data-coupee={alertes[r.cle] ? undefined : ''}>
              <label>
                <input
                  type="checkbox"
                  checked={alertes[r.cle]}
                  disabled={busy !== null}
                  onChange={(e) => bascule(r.cle, e.target.checked)}
                />
                <span>
                  <b>{r.titre}</b>
                  <small>{r.aide}</small>
                </span>
                <em>{alertes[r.cle] ? 'Dans le tchat' : 'Coupé'}</em>
              </label>
            </li>
          ))}
        </ul>
      </Panneau>
    </EcranAdmin>
  );
}
