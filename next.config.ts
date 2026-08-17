import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  /* config options here */
  // app.press-pilot.com is the product surface for existing/signing-up customers
  // only. All marketing/SEO traffic should live on press-pilot.com. These two
  // routes duplicated marketing content that now has a canonical home there —
  // redirect instead of serving duplicate content on this subdomain.
  async redirects() {
    return [
      {
        source: '/',
        destination: 'https://press-pilot.com/',
        permanent: true,
      },
      {
        source: '/dmo',
        destination: 'https://press-pilot.com/solutions/dmos',
        permanent: true,
      },
    ];
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  eslint: {
    ignoreDuringBuilds: false,
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'picsum.photos',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'firebasestorage.googleapis.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'dmo-press-release.firebasestorage.app',
        port: '',
        pathname: '/**',
      },
    ],
  },
};

export default nextConfig;
