import type { NextConfig } from "next";

/** Un an, sans jamais redemander : le fichier ne change pas sous cette adresse. */
const IMMUABLE = [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }];

const nextConfig: NextConfig = {
  // Ne pas annoncer « Next.js » dans chaque réponse : c'est dire à un
  // attaquant quelles failles chercher.
  poweredByHeader: false,
  experimental: {
    // Une page déjà vue se rouvre sur-le-champ pendant 30 secondes, sans
    // repasser par le serveur ; les gestes du site (`router.refresh()`) vident
    // ce cache, et les écrans qui bougent en direct interrogent leur API.
    staleTimes: { dynamic: 30 },
  },
  async headers() {
    /*
     * Les illustrations sont adressées par leur contenu (`scripts/index-art.mjs`) :
     * l'index les demande avec l'empreinte du fichier (`?v=…`), et le nom d'une
     * vignette porte celle de l'image dont elle vient. Une image remplacée
     * change donc d'adresse ; celle-ci peut se garder un an. Sans ces règles,
     * chaque visite redemandait chaque carte au serveur (`max-age=0`), une
     * requête par image avant de pouvoir l'afficher.
     */
    return [
      { source: "/cartes/vignettes/:fichier([\\w.-]+\\.webp)", headers: IMMUABLE },
      {
        source: "/cartes/:fichier([\\w.-]+\\.(?:webp|avif|png|jpe?g))",
        has: [{ type: "query", key: "v" }],
        headers: IMMUABLE,
      },
      {
        source: "/boosters/:fichier([\\w.-]+\\.(?:webp|avif|png|jpe?g))",
        has: [{ type: "query", key: "v" }],
        headers: IMMUABLE,
      },
    ];
  },
};

export default nextConfig;
