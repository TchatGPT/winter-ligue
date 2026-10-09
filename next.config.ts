import type { NextConfig } from "next";

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
};

export default nextConfig;
