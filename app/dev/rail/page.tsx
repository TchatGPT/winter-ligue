import { notFound } from 'next/navigation';
import { RailBanc } from './RailBanc';

export const metadata = { title: 'Banc du rail' };

/**
 * Le banc de réglage du rail. **Hors production.**
 *
 * Régler le ressenti d'une roulette demande de la relancer trente fois de suite,
 * en changeant une chose à chaque fois. Le faire sur la vraie page coûte trente
 * boosters et un aller-retour au serveur par essai ; ici c'est un clic, et rien
 * n'est débité parce que rien n'est acheté — la gagnante est choisie à la main.
 *
 * La garde est au rendu et non dans un `middleware` : une route de développement
 * qui répond 404 en production ne peut pas être oubliée dans une configuration.
 */
export default function BancDuRail() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <RailBanc />;
}
