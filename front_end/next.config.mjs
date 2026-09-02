/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  async rewrites() {
    // Only apply the proxy rewrite if we are explicitly running in the testing environment
    // where NEXT_PUBLIC_ENV is set to "test" or similar, or based on the host.
    // For local dev, you can still test it, but it won't break production (lead.mawsool.tech)
    if (process.env.NODE_ENV === 'development' || process.env.ENABLE_API_PROXY === 'true') {
      return [
        {
          source: '/api/:path*',
          destination: 'http://localhost:8000/api/:path*',
        },
      ];
    }
    return [];
  },
};

export default nextConfig;
