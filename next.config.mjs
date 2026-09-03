/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverComponentsExternalPackages: ['@electric-sql/pglite', 'postgres', 'bcryptjs']
  }
};

export default nextConfig;
