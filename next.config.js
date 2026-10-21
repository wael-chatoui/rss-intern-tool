const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  distDir: process.env.RSS_BUILD_DIR || '.next',
  async headers() {
    return [
      { source: '/api/:path*', headers: [{ key: 'Cache-Control', value: 'private, no-store, max-age=0' }, { key: 'X-Content-Type-Options', value: 'nosniff' }] },
      { source: '/espace/:path*', headers: [{ key: 'Cache-Control', value: 'private, no-store, max-age=0' }, { key: 'X-Frame-Options', value: 'DENY' }] },
      { source: '/connexion', headers: [{ key: 'Cache-Control', value: 'private, no-store, max-age=0' }, { key: 'X-Frame-Options', value: 'DENY' }] },
    ];
  },
  images: {
    // The reader renders publisher images directly. No public server-side image
    // proxy is needed for arbitrary URLs supplied by subscribers.
    unoptimized: true,
  },
  webpack: (config) => {
    config.resolve.alias['@'] = path.resolve(__dirname, 'src');
    return config;
  },
};

module.exports = nextConfig;
