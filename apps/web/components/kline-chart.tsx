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
  macd: boolean
  kdj: boolean
  rsi: boolean
}

interface Props {
  bars: Bar[]
  indicators: Indicators
}

// A-share convention: 红涨绿跌 (red = up, green = down)
const UP = '#ef4444'
const DOWN = '#10b981'
// Shared indicator palette (yellow / blue / purple)
const C1 = '#eab308', C2 = '#3b82f6', C3 = '#a855f7'

type LinePoint = { time: Time; value: number }

// ── Indicator math ───────────────────────────────────────────────────────────
function sma(bars: Bar[], period: number): LinePoint[] {
  const out: LinePoint[] = []
  let sum = 0
  for (let i = 0; i < bars.length; i++) {
    sum += bars[i].close
    if (i >= period) sum -= bars[i - period].close
    if (i >= period - 1) out.push({ time: bars[i].time as Time, value: +(sum / period).toFixed(2) })
  }
  return out
}

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

function emaArr(values: number[], period: number): number[] {
  const k = 2 / (period + 1)
  const out: number[] = []
  let prev = values[0] ?? 0
  for (let i = 0; i < values.length; i++) {
    prev = i === 0 ? values[0] : values[i] * k + prev * (1 - k)
    out.push(prev)
  }
  return out
}

// MACD: DIF = EMA12 - EMA26, DEA = EMA9(DIF), bar = 2*(DIF - DEA)
function macd(bars: Bar[]) {
  const closes = bars.map((b) => b.close)
  const e12 = emaArr(closes, 12)
  const e26 = emaArr(closes, 26)
  const dif = e12.map((v, i) => v - e26[i])
  const dea = emaArr(dif, 9)
  const difL: LinePoint[] = [], deaL: LinePoint[] = []
  const hist: { time: Time; value: number; color: string }[] = []
  for (let i = 0; i < bars.length; i++) {
    const t = bars[i].time as Time
    difL.push({ time: t, value: +dif[i].toFixed(3) })
    deaL.push({ time: t, value: +dea[i].toFixed(3) })
    const m = +(2 * (dif[i] - dea[i])).toFixed(3)
    hist.push({ time: t, value: m, color: m >= 0 ? 'rgba(239,68,68,0.6)' : 'rgba(16,185,129,0.6)' })
  }
  return { difL, deaL, hist }
}

// KDJ: N=9, K=2/3·K₋₁+1/3·RSV, D=2/3·D₋₁+1/3·K, J=3K-2D
function kdj(bars: Bar[], n = 9) {
  const k: LinePoint[] = [], d: LinePoint[] = [], j: LinePoint[] = []
  let pk = 50, pd = 50
  for (let i = 0; i < bars.length; i++) {
    const s = Math.max(0, i - n + 1)
    let lo = Infinity, hi = -Infinity
    for (let x = s; x <= i; x++) { lo = Math.min(lo, bars[x].low); hi = Math.max(hi, bars[x].high) }
    const rsv = hi === lo ? 50 : ((bars[i].close - lo) / (hi - lo)) * 100
    const kv = (2 / 3) * pk + (1 / 3) * rsv
    const dv = (2 / 3) * pd + (1 / 3) * kv
    const jv = 3 * kv - 2 * dv
    pk = kv; pd = dv
    if (i >= n - 1) {
      const t = bars[i].time as Time
      k.push({ time: t, value: +kv.toFixed(2) })
      d.push({ time: t, value: +dv.toFixed(2) })
      j.push({ time: t, value: +jv.toFixed(2) })
    }
  }
  return { k, d, j }
}

// RSI (Wilder smoothing) for a given period
function rsi(bars: Bar[], period: number): LinePoint[] {
  const out: LinePoint[] = []
  let avgGain = 0, avgLoss = 0
  for (let i = 1; i < bars.length; i++) {
    const ch = bars[i].close - bars[i - 1].close
    const g = Math.max(ch, 0), l = Math.max(-ch, 0)
    if (i <= period) {
      avgGain += g; avgLoss += l
      if (i === period) {
        avgGain /= period; avgLoss /= period
        const rs = avgGain / (avgLoss || 1e-9)
        out.push({ time: bars[i].time as Time, value: +(100 - 100 / (1 + rs)).toFixed(2) })
      }
    } else {
      avgGain = (avgGain * (period - 1) + g) / period
      avgLoss = (avgLoss * (period - 1) + l) / period
      const rs = avgGain / (avgLoss || 1e-9)
      out.push({ time: bars[i].time as Time, value: +(100 - 100 / (1 + rs)).toFixed(2) })
    }
  }
  return out
}

// ── Component ─────────────────────────────────────────────────────────────────
export function KLineChart({ bars, indicators }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const { resolvedTheme } = useTheme()

  const subCount = [indicators.macd, indicators.kdj, indicators.rsi].filter(Boolean).length
  const height = 440 + subCount * 150

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
      priceFormat: { type: 'volume' }, priceScaleId: '',
      priceLineVisible: false, lastValueVisible: false,
    })
    volume.priceScale().applyOptions({ scaleMargins: { top: 0.78, bottom: 0 } })
    volume.setData(
      bars.map((b) => ({
        time: b.time as Time, value: b.volume,
        color: b.close >= b.open ? 'rgba(239,68,68,0.4)' : 'rgba(16,185,129,0.4)',
      }))
    )

    const addLine = (data: LinePoint[], color: string, paneIndex = 0, style = LineStyle.Solid) => {
      if (data.length === 0) return
      const line = chart.addSeries(LineSeries, {
        color, lineWidth: 1, lineStyle: style,
        priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
      }, paneIndex)
      line.setData(data)
      return line
    }

    // ── Main-pane overlays ──
    if (indicators.ma) {
      for (const [p, c] of [[5, C1], [10, C2], [20, C3]] as [number, string][]) {
        if (bars.length > p) addLine(sma(bars, p), c)
      }
    }
    if (indicators.boll && bars.length > 20) {
      const { upper, mid, lower } = boll(bars, 20, 2)
      addLine(upper, '#f97316', 0, LineStyle.Dashed)
      addLine(mid, '#06b6d4')
      addLine(lower, '#f97316', 0, LineStyle.Dashed)
    }

    // ── Sub-panes (each enabled indicator gets its own pane) ──
    let pane = 0

    if (indicators.macd && bars.length > 26) {
      pane += 1
      const { difL, deaL, hist } = macd(bars)
      const h = chart.addSeries(HistogramSeries, {
        priceLineVisible: false, lastValueVisible: false,
      }, pane)
      h.setData(hist)
      addLine(difL, C1, pane)
      addLine(deaL, C2, pane)
    }

    if (indicators.kdj && bars.length > 9) {
      pane += 1
      const { k, d, j } = kdj(bars)
      addLine(k, C1, pane)
      addLine(d, C2, pane)
      addLine(j, C3, pane)
    }

    if (indicators.rsi && bars.length > 24) {
      pane += 1
      const r6 = addLine(rsi(bars, 6), C1, pane)
      addLine(rsi(bars, 12), C2, pane)
      addLine(rsi(bars, 24), C3, pane)
      // 70 / 30 reference lines
      r6?.createPriceLine({ price: 70, color: border, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false })
      r6?.createPriceLine({ price: 30, color: border, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false })
    }

    // Distribute pane heights: main pane large, sub-panes compact
    const panes = chart.panes()
    if (panes.length > 1) {
      panes[0].setStretchFactor(3.2)
      for (let i = 1; i < panes.length; i++) panes[i].setStretchFactor(1)
    }

    chart.timeScale().fitContent()

    return () => { chart.remove(); chartRef.current = null }
  }, [bars, resolvedTheme, indicators.ma, indicators.boll, indicators.macd, indicators.kdj, indicators.rsi])

  return <div ref={containerRef} className="w-full" style={{ height }} />
}
