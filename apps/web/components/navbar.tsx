'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BarChart2, MessageSquare, BookOpen, Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const navItems = [
  { href: '/', label: '提问', icon: MessageSquare },
  { href: '/records', label: '记录', icon: BookOpen },
  { href: '/stocks', label: '股票', icon: BarChart2 },
]

export function Navbar() {
  const pathname = usePathname()
  const { theme, setTheme } = useTheme()

  return (
    <header className="border-b bg-background/80 backdrop-blur sticky top-0 z-40">
      <div className="container mx-auto px-4 max-w-[1320px] h-14 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <span className="font-semibold text-primary">StockHelper</span>
          <nav className="flex items-center gap-1">
            {navItems.map(({ href, label, icon: Icon }) => (
              <Link key={href} href={href}>
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn(
                    'gap-1.5',
                    pathname === href && 'bg-accent text-accent-foreground'
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </Button>
              </Link>
            ))}
          </nav>
        </div>
        <Button
          variant="ghost"
          size="icon"
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
