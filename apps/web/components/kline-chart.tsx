'use client'

import { useEffect, useRef } from 'react'
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  CrosshairMode,
  ColorType,
  type IChartApi,
  type Time,
} from 'lightweight-charts'
import { useTheme } from 'next-themes'

export interface Bar {
  time: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

interface Props {
  bars: Bar[]
}

// A-share convention: 红涨绿跌 (red = up, green = down)
const UP = '#ef4444'
const DOWN = '#10b981'

function ma(bars: Bar[], period: number) {
  const out: { time: Time; value: number }[] = []
  let sum = 0
  for (let i = 0; i < bars.length; i++) {
    sum += bars[i].close
    if (i >= period) sum -= bars[i - period].close
    if (i >= period - 1) out.push({ time: bars[i].time as Time, value: +(sum / period).toFixed(2) })
  }
  return out
}

export function KLineChart({ bars }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const { resolvedTheme } = useTheme()

  useEffect(() => {
    const el = containerRef.current
    if (!el || bars.length === 0) return

    const dark = resolvedTheme === 'dark'
    const text = dark ? '#a1a1aa' : '#52525b'
    const grid = dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)'
    const border = dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'

    const chart = createChart(el, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: text,
        fontFamily: 'inherit',
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: grid },
        horzLines: { color: grid },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: border, scaleMargins: { top: 0.08, bottom: 0.28 } },
      timeScale: { borderColor: border, rightOffset: 4, fixLeftEdge: true, fixRightEdge: true },
      autoSize: true,
      handleScale: { axisPressedMouseMove: { time: true, price: false } },
    })
    chartRef.current = chart

    const candles = chart.addSeries(CandlestickSeries, {
      upColor: UP, downColor: DOWN,
      borderUpColor: UP, borderDownColor: DOWN,
      wickUpColor: UP, wickDownColor: DOWN,
      priceLineVisible: false,
    })
    candles.setData(
      bars.map((b) => ({ time: b.time as Time, open: b.open, high: b.high, low: b.low, close: b.close }))
    )

    const volume = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: '',
      priceLineVisible: false,
      lastValueVisible: false,
    })
    volume.priceScale().applyOptions({ scaleMargins: { top: 0.78, bottom: 0 } })
    volume.setData(
      bars.map((b) => ({
        time: b.time as Time,
        value: b.volume,
        color: b.close >= b.open ? 'rgba(239,68,68,0.4)' : 'rgba(16,185,129,0.4)',
      }))
    )

    // Moving averages
    const maConfigs: [number, string][] = [[5, '#eab308'], [10, '#3b82f6'], [20, '#a855f7']]
    for (const [period, color] of maConfigs) {
      if (bars.length > period) {
        const line = chart.addSeries(LineSeries, {
          color, lineWidth: 1,
          priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
        })
        line.setData(ma(bars, period))
      }
    }

    chart.timeScale().fitContent()

    return () => { chart.remove(); chartRef.current = null }
  }, [bars, resolvedTheme])

  return <div ref={containerRef} className="w-full h-[480px]" />
}
