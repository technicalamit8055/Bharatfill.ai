/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // Workspace packages ship TypeScript source, so Next compiles them in-place.
  transpilePackages: [
    '@assistigo/core',
    '@assistigo/ui',
    '@assistigo/ai',
    '@assistigo/document-tools',
    '@assistigo/form-engine',
  ],

  // The sessions page reads these by path at runtime, so file tracing cannot find them itself.
  serverExternalPackages: ['maxmind'],
  outputFileTracingIncludes: {
    '/settings/sessions': ['../../node_modules/@ip-location-db/dbip-city-mmdb/*.mmdb'],
  },

  experimental: {
    serverActions: {
      // The default is 1 MB, and a scheme banner may itself be 1 MB (migration 0028) before the
      // multipart envelope. The only Server Action that takes a file is the admin panel's scheme
      // image upload, which re-checks the size per kind; customer documents go through /api.
      bodySizeLimit: '2mb',
    },
  },

  typescript: {
    // Type errors fail the build. `npm run typecheck` is the fast local loop.
    ignoreBuildErrors: false,
  },

  eslint: {
    // Linting runs as its own CI job, not inside next build.
    ignoreDuringBuilds: true,
  },

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
          },
        ],
      },
      {
        // Customer data must never be cached by an intermediary.
        source: '/api/:path*',
        headers: [{ key: 'Cache-Control', value: 'no-store, max-age=0' }],
      },
    ];
  },
};

export default nextConfig;
