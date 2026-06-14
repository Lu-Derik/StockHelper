'use client'

import { useEffect, useRef } from 'react'
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  CrosshairMode,
  ColorType,
  LineStyle,
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

export interface Indicators {
  ma: boolean
  boll: boolean
}

interface Props {
  bars: Bar[]
  indicators: Indicators
}

// A-share convention: 红涨绿跌 (red = up, green = down)
const UP = '#ef4444'
const DOWN = '#10b981'

type LinePoint = { time: Time; value: number }

function ma(bars: Bar[], period: number): LinePoint[] {
  const out: LinePoint[] = []
  let sum = 0
  for (let i = 0; i < bars.length; i++) {
    sum += bars[i].close
    if (i >= period) sum -= bars[i - period].close
    if (i >= period - 1) out.push({ time: bars[i].time as Time, value: +(sum / period).toFixed(2) })
  }
  return out
}

// Bollinger Bands: middle = SMA(period), upper/lower = middle ± k * stddev
function boll(bars: Bar[], period = 20, k = 2) {
  const upper: LinePoint[] = [], mid: LinePoint[] = [], lower: LinePoint[] = []
  for (let i = period - 1; i < bars.length; i++) {
    let sum = 0
    for (let j = i - period + 1; j <= i; j++) sum += bars[j].close
    const mean = sum / period
    let sq = 0
    for (let j = i - period + 1; j <= i; j++) sq += (bars[j].close - mean) ** 2
    const sd = Math.sqrt(sq / period)
    const t = bars[i].time as Time
    mid.push({ time: t, value: +mean.toFixed(2) })
    upper.push({ time: t, value: +(mean + k * sd).toFixed(2) })
    lower.push({ time: t, value: +(mean - k * sd).toFixed(2) })
  }
  return { upper, mid, lower }
}

export function KLineChart({ bars, indicators }: Props) {
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
      grid: { vertLines: { color: grid }, horzLines: { color: grid } },
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

    const addLine = (data: LinePoint[], color: string, style = LineStyle.Solid) => {
      if (data.length === 0) return
      const line = chart.addSeries(LineSeries, {
        color, lineWidth: 1, lineStyle: style,
        priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
      })
      line.setData(data)
    }

    if (indicators.ma) {
      const maConfigs: [number, string][] = [[5, '#eab308'], [10, '#3b82f6'], [20, '#a855f7']]
      for (const [period, color] of maConfigs) {
        if (bars.length > period) addLine(ma(bars, period), color)
      }
    }

    if (indicators.boll && bars.length > 20) {
      const { upper, mid, lower } = boll(bars, 20, 2)
      addLine(upper, '#f97316', LineStyle.Dashed)
      addLine(mid, '#06b6d4')
      addLine(lower, '#f97316', LineStyle.Dashed)
    }

    chart.timeScale().fitContent()

    return () => { chart.remove(); chartRef.current = null }
  }, [bars, resolvedTheme, indicators.ma, indicators.boll])

  return <div ref={containerRef} className="w-full h-[480px]" />
}
