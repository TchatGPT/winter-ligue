import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

/**
 * L'ancienne page de bienvenue. Le pseudo Warzone se donne maintenant dans la
 * fenêtre d'inscription, qui s'ouvre par-dessus n'importe quelle page
 * (`InscriptionWarzone`) : l'adresse reste, pour les anciens liens.
 */
export default function BienvenuePage() {
  redirect('/');
}
