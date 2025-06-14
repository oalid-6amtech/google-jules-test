/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { isServer }) => {
    // Mark puppeteer as external for server-side builds
    if (isServer) {
      config.externals = [...config.externals, 'puppeteer'];
    }
    return config;
  },
};

export default nextConfig;
