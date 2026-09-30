/**
 * Un lien d'overlay qui ne mène nulle part. Visible exprès : c'est pendant le
 * réglage d'OBS qu'on le voit, et il faut savoir quoi faire.
 */
export function OverlayRefus({ motif }: { motif: 'invalide' | 'revoque' }) {
  return (
    <div className="ov-refus glass">
      <strong>{motif === 'revoque' ? 'Ce lien d’overlay a été régénéré.' : 'Lien d’overlay invalide.'}</strong>
      <span>Copie le lien à jour dans la modération, onglet Overlays.</span>
    </div>
  );
}
