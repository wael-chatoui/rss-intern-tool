const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  distDir: process.env.RSS_BUILD_DIR || '.next',
  async headers() {
    return [
      { source: '/api/:path*', headers: [{ key: 'Cache-Control', value: 'private, no-store, max-age=0' }, { key: 'X-Content-Type-Options', value: 'nosniff' }] },
      { source: '/espace/:path*', headers: [{ key: 'Cache-Control', value: 'private, no-store, max-age=0' }, { key: 'X-Frame-Options', value: 'DENY' }] },
      { source: '/connexion', headers: [{ key: 'Cache-Control', value: 'private, no-store, max-age=0' }, { key: 'X-Frame-Options', value: 'DENY' }] },
    ];
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
      { protocol: 'http', hostname: '**' },
    ],
  },
  webpack: (config) => {
    config.resolve.alias['@'] = path.resolve(__dirname, 'src');
    return config;
  },
};

module.exports = nextConfig;
