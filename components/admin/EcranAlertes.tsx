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
  {
    cle: 'overlayBoosters',
    titre: 'Ouverture des boosters dans l’overlay',
    aide: 'L’animation d’ouverture et la carte tirée sur le stream (Perso et Finisseur).',
  },
  {
    cle: 'overlayDuels',
    titre: 'Duels lancés dans l’overlay',
    aide: 'La ligne « … lance un duel » au-dessus du compteur de subs.',
  },
];

/**
 * Les alertes du live (16/11/2026) : de quoi tester — ouvrir des boosters,
 * lancer des duels — pendant que la streameuse est en live, sans que rien ne
 * passe sur le stream ni dans le tchat. Les cartes se règlent quand même :
 * seule l'annonce est coupée.
 */
export function EcranAlertes({ alertes }: { alertes: AlertesLive }) {
  const { busy, message, envoie, setMessage } = useAction();

  function bascule(cle: keyof AlertesLive, valeur: boolean) {
    void envoie(
      '/api/admin/config',
      { alertes: { [cle]: valeur } },
      { methode: 'PATCH', cle, succes: valeur ? 'Alerte rallumée : elle passe sur le live.' : 'Alerte coupée : elle ne passe plus sur le live.' },
    );
  }

  const coupees = REGLAGES.filter((r) => !alertes[r.cle]).length;

  return (
    <EcranAdmin
      intro="Coupe une alerte pour faire tes tests pendant le live : les boosters s’ouvrent et les duels se jouent pour de vrai, mais rien ne s’affiche sur le stream ni dans le tchat. Pense à tout rallumer après."
      grille="seul"
      message={message}
      onFermeMessage={() => setMessage(null)}
    >
      <Panneau
        titre="Alertes du live"
        sousTitre={
          coupees === 0
            ? 'Tout passe sur le live.'
            : `${coupees} alerte${coupees > 1 ? 's' : ''} coupée${coupees > 1 ? 's' : ''} : elle${coupees > 1 ? 's' : ''} ne passe${coupees > 1 ? 'nt' : ''} pas sur le live.`
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
                <em>{alertes[r.cle] ? 'Sur le live' : 'Coupée'}</em>
              </label>
            </li>
          ))}
        </ul>
      </Panneau>
    </EcranAdmin>
  );
}
