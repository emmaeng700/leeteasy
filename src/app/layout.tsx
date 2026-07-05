import type { Metadata, Viewport } from 'next'
import { Suspense } from 'react'
import Script from 'next/script'
import { Inter } from 'next/font/google'
import { Toaster } from 'react-hot-toast'
import Navbar from '@/components/Navbar'
import SwRegister from '@/components/SwRegister'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'LeetEasy',
  description: 'Daily LeetCode practice - open in the app, sync when done.',
  manifest: '/manifest.json',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.className} min-h-dvh bg-zinc-50 text-zinc-900 antialiased`}>
        <Script
          id="dev-sw-purge"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `(function(){var h=location.hostname;if(h!=='localhost'&&h!=='127.0.0.1'&&!h.endsWith('.local'))return;if('serviceWorker'in navigator){navigator.serviceWorker.getRegistrations().then(function(r){r.forEach(function(x){x.unregister()})})}if('caches'in window){caches.keys().then(function(k){k.forEach(function(n){caches.delete(n)})})}})();`,
          }}
        />
        <SwRegister />
        <Suspense fallback={<nav className="sticky top-0 z-50 h-12 border-b border-zinc-200 bg-white" />}>
          <Navbar />
        </Suspense>
        <main className="pb-[max(1rem,env(safe-area-inset-bottom))]">{children}</main>
        <Toaster position="bottom-center" toastOptions={{ className: 'text-sm' }} />
      </body>
    </html>
  )
}
