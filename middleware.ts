import { NextResponse, type NextRequest } from 'next/server';

/**
 * En-têtes de sécurité appliqués à chaque réponse.
 *
 * Le cœur du dispositif est la CSP avec nonce : seuls les scripts portant le
 * nonce généré pour *cette* réponse s'exécutent. Une injection de balise
 * `<script>` par un pseudo ou une note de game est donc inerte, même si elle
 * franchissait l'échappement de React.
 *
 * `frame-ancestors 'none'` interdit l'inclusion du site dans une iframe : pas
 * de détournement de clic sur les boutons d'enchère.
 */
export function middleware(request: NextRequest): NextResponse {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const isDev = process.env.NODE_ENV !== 'production';

  const csp = [
    "default-src 'self'",
    // 'strict-dynamic' laisse les scripts chargés par un script de confiance
    // s'exécuter, ce dont Next a besoin pour son hydratation.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' ${isDev ? "'unsafe-eval'" : ''}`,
    // Next injecte ses styles critiques en ligne ; 'unsafe-inline' reste
    // acceptable ici, une feuille de style ne permettant pas d'exécution.
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    'font-src https://fonts.gstatic.com',
    // Les avatars Twitch, le jour où l'authentification sera branchée.
    "img-src 'self' data: blob: https://static-cdn.jtvnw.net",
    "connect-src 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "object-src 'none'",
    ...(isDev ? [] : ['upgrade-insecure-requests']),
  ]
    .filter(Boolean)
    .join('; ');

  const headers = new Headers(request.headers);
  headers.set('x-nonce', nonce);

  const response = NextResponse.next({ request: { headers } });

  response.headers.set('Content-Security-Policy', csp);
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  );
  response.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  response.headers.set('X-DNS-Prefetch-Control', 'off');
  if (!isDev) {
    response.headers.set(
      'Strict-Transport-Security',
      'max-age=63072000; includeSubDomains; preload',
    );
  }

  return response;
}

export const config = {
  // On applique tout sauf les fichiers statiques, qui n'ont pas besoin de CSP.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
