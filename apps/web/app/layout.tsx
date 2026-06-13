import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'
import { Providers } from './providers'
import { Navbar } from '@/components/navbar'
import { Suspense } from 'react'
import { StockSidebar } from '@/components/stock-sidebar'

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] })
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'StockHelper — A股AI研究助手',
  description: '基于AI的A股研究问答与记录工具',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="zh"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full`}
    >
      <body suppressHydrationWarning className="min-h-full flex flex-col bg-background text-foreground antialiased">
        <Providers>
          <Navbar />
          <div className="flex-1 container mx-auto px-4 py-6 max-w-[1320px] flex gap-6 items-start">
            <Suspense>
              <StockSidebar />
            </Suspense>
            <main className="flex-1 min-w-0">
              {children}
            </main>
          </div>
        </Providers>
      </body>
    </html>
  )
}
