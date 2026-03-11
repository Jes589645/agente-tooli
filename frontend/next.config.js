/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  async rewrites() {
    return [
      {
        source: '/api/tooli/:path*',
        destination: (process.env.TOOLI_API_URL || 'http://backend:8080') + '/:path*',
      },
    ]
  },
}

module.exports = nextConfig
