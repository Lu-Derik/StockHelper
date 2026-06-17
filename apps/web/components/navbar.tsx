'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { BarChart2, MessageSquare, BookOpen, Moon, Sun, CandlestickChart } from 'lucide-react'
import { useTheme } from 'next-themes'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { getSelectedStock, SELECTED_EVENT, type SelectedStock } from '@/lib/selected-stock'

// carriesStock: whether the page defaults to a stock (股票 page has no concept of one)
const navItems = [
  { href: '/', label: '提问', icon: MessageSquare, carriesStock: true },
  { href: '/kline', label: 'K线', icon: CandlestickChart, carriesStock: true },
  { href: '/records', label: '记录', icon: BookOpen, carriesStock: true },
  { href: '/stocks', label: '股票', icon: BarChart2, carriesStock: false },
]

export function Navbar() {
  const pathname = usePathname()
  const { theme, setTheme } = useTheme()
  const [selected, setSelected] = useState<SelectedStock | null>(null)

  useEffect(() => {
    const sync = () => setSelected(getSelectedStock())
    sync()
    window.addEventListener(SELECTED_EVENT, sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(SELECTED_EVENT, sync)
      window.removeEventListener('storage', sync)
    }
  }, [])

  // Append the selected stock so switching pages keeps the same default stock.
  const linkFor = (href: string, carriesStock: boolean) => {
    if (!carriesStock || !selected) return href
    const code = encodeURIComponent(selected.code)
    return href === '/'
      ? `/?code=${code}&name=${encodeURIComponent(selected.name)}`
      : `${href}?code=${code}`
  }

  return (
    <header className="border-b bg-background/90 backdrop-blur-sm sticky top-0 z-40 shadow-sm">
      <div className="container mx-auto px-4 max-w-[1320px] h-14 flex items-center justify-between">
        <div className="flex items-center gap-7">
          {/* Brand */}
          <Link href="/" className="flex items-center gap-2 select-none group">
            <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center shadow-sm group-hover:shadow-md transition-shadow">
              <BarChart2 className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="font-bold text-base tracking-tight text-foreground">
              StockHelper
            </span>
          </Link>

          {/* Nav */}
          <nav className="flex items-center gap-0.5">
            {navItems.map(({ href, label, icon: Icon, carriesStock }) => {
              const active = pathname === href || (href !== '/' && pathname.startsWith(href))
              return (
                <Link key={href} href={linkFor(href, carriesStock)}>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={cn(
                      'gap-1.5 h-8 px-3 text-sm font-medium rounded-lg transition-all',
                      active
                        ? 'bg-primary/10 text-primary hover:bg-primary/15'
                        : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                  </Button>
                </Link>
              )
            })}
          </nav>
        </div>

        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          aria-label="切换主题"
        >
          <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
        </Button>
      </div>
    </header>
  )
}
