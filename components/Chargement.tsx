/**
 * L'écran d'attente d'une page : des plaques de verre vides, à la place de
 * celles qui arrivent.
 *
 * Sans lui, Next ne préchargeait aucune page du site — elles sont toutes
 * dynamiques — et un clic ne changeait rien à l'écran tant que le serveur
 * n'avait pas tout rendu. Avec lui, chaque lien précharge la mise en page et
 * cet écran : au clic, le menu bascule tout de suite, et la page se remplit
 * dès qu'elle arrive.
 *
 * Il n'apparaît qu'au bout d'un instant (`.chargement`) : une page qui répond
 * vite passe sans clignoter.
 */
export function Chargement({ disposition = 'page' }: { disposition?: 'page' | 'moderation' }) {
  return (
    <div className="chargement" data-disposition={disposition} role="status" aria-label="Chargement de la page">
      {disposition === 'page' && (
        <div className="glass chargement-plaque chargement-tete">
          <span className="chargement-ligne" style={{ width: '9rem' }} />
          <span className="chargement-ligne chargement-titre" style={{ width: '16rem' }} />
        </div>
      )}
      <div className="chargement-grille">
        {[0, 1].map((i) => (
          <div key={i} className="glass chargement-plaque">
            <span className="chargement-ligne chargement-titre" style={{ width: i ? '11rem' : '14rem' }} />
            {[92, 78, 85, 64, 88].map((l, j) => (
              <span key={j} className="chargement-ligne" style={{ width: `${l - i * 6}%` }} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
