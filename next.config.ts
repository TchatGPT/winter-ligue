import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Ne pas annoncer « Next.js » dans chaque réponse : c'est dire à un
  // attaquant quelles failles chercher.
  poweredByHeader: false,
};

export default nextConfig;
