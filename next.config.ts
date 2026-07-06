import type { NextConfig } from 'next'
import path from 'path'

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_APP_BUILD_ID:
      process.env.VERCEL_GIT_COMMIT_SHA ||
      process.env.GITHUB_SHA ||
      'local',
  },
  turbopack: {
    root: path.join(__dirname),
  },
}

export default nextConfig
