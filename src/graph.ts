/**
 * 2D polynomial graph.
 *
 * Design goals:
 *  • Always shows the TRUE min and max of f(t) on the y-axis, with labels.
 *  • Zero line is always visible.
 *  • Local extrema are marked with diamonds.
 *  • Roots are marked with vertical lines + dots + t-labels.
 *  • Proper HiDPI (DPR) rendering.
 */
import type { QuarticCoeffs } from './torusMath'
import { evalQuartic, evalQuarticDeriv } from './torusMath'

const N = 800        // number of curve samples
const PAD = { top: 26, right: 18, bottom: 34, left: 68 }

export class PolynomialGraph {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')!
  }

  draw(coeffs: QuarticCoeffs, roots: number[], tMin = 0, tMax = 20) {
    const { canvas, ctx } = this

    // ── HiDPI setup ───────────────────────────────────────────────
    const dpr = window.devicePixelRatio || 1
    const cssW = canvas.clientWidth  || 350
    const cssH = canvas.clientHeight || 160
    canvas.width  = Math.round(cssW * dpr)
    canvas.height = Math.round(cssH * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)   // draw in CSS pixels

    const W = cssW, H = cssH
    const { top: pT, right: pR, bottom: pB, left: pL } = PAD
    const pw = W - pL - pR
    const ph = H - pT - pB

    // ── Sample f(t) ───────────────────────────────────────────────
    const ts: number[] = []
    const fs: number[] = []
    for (let i = 0; i <= N; i++) {
      const t = tMin + (i / N) * (tMax - tMin)
      ts.push(t)
      fs.push(evalQuartic(coeffs, t))
    }

    // ── Y range: based on LOCAL extrema, not global endpoints ──────
    // The quartic blows up at the edges (t→∞), which would dwarf the
    // interesting region around the roots. Instead we scale to the
    // local extrema (f′(t)=0 points) and always include 0.
    // Fallback to global min/max only when no extrema exist.
    const extrema = findExtrema(coeffs, ts)
    const interestingYValues = [0, ...extrema.map(e => e.f)]
    // Also include the value at each root (always 0, but keeps type happy)
    const fMin = Math.min(...interestingYValues)
    const fMax = Math.max(...interestingYValues)

    const PADDING_FACTOR = 1.2
    const yLo  = fMin < 0 ? fMin * PADDING_FACTOR : fMin / PADDING_FACTOR
    const yHi  = fMax > 0 ? fMax * PADDING_FACTOR : fMax / PADDING_FACTOR
    const yMin = yLo === yHi ? yLo - 1 : yLo
    const yMax = yLo === yHi ? yHi + 1 : yHi

    // ── Coordinate helpers ────────────────────────────────────────
    const tToX = (t: number) => pL + ((t - tMin) / (tMax - tMin)) * pw
    const yToY = (y: number) => pT + ((yMax - y) / (yMax - yMin)) * ph
    const clampY = (y: number) => Math.max(yMin, Math.min(yMax, y))

    // ── Background ────────────────────────────────────────────────
    ctx.fillStyle = '#080810'
    ctx.fillRect(0, 0, W, H)
    ctx.fillStyle = '#0c0c18'
    ctx.fillRect(pL, pT, pw, ph)

    // ── Y ticks ───────────────────────────────────────────────────
    // Nice ticks + forced entries for 0, fMin, fMax
    const yTicks = makeYTicks(yMin, yMax, fMin, fMax, ph)

    ctx.strokeStyle = '#1e1e30'
    ctx.lineWidth = 1
    ctx.beginPath()
    for (const yv of yTicks.nice) {
      const cy = yToY(yv)
      ctx.moveTo(pL, cy); ctx.lineTo(pL + pw, cy)
    }
    ctx.stroke()

    // ── T ticks ───────────────────────────────────────────────────
    const tTicks = niceTicks(tMin, tMax, Math.max(3, Math.floor(pw / 65)))

    ctx.strokeStyle = '#1e1e30'
    ctx.lineWidth = 1
    ctx.beginPath()
    for (const tv of tTicks) {
      const cx = tToX(tv)
      ctx.moveTo(cx, pT); ctx.lineTo(cx, pT + ph)
    }
    ctx.stroke()

    // ── Zero line ─────────────────────────────────────────────────
    const zeroY = yToY(0)
    ctx.strokeStyle = '#404058'
    ctx.lineWidth = 1.5
    ctx.setLineDash([5, 4])
    ctx.beginPath()
    ctx.moveTo(pL, zeroY); ctx.lineTo(pL + pw, zeroY)
    ctx.stroke()
    ctx.setLineDash([])

    // ── Polynomial curve ──────────────────────────────────────────
    ctx.beginPath()
    ctx.strokeStyle = '#7ec8e3'
    ctx.lineWidth = 2
    let pen: 'up' | 'down' = 'up'
    for (let i = 0; i <= N; i++) {
      const cx = tToX(ts[i])
      const fy = fs[i]
      const cy = yToY(clampY(fy))
      const clipped = fy < yMin || fy > yMax
      if (pen === 'up' || clipped) { ctx.moveTo(cx, cy); pen = clipped ? 'up' : 'down' }
      else ctx.lineTo(cx, cy)
    }
    ctx.stroke()

    // ── Local extrema (diamonds) ──────────────────────────────────
    for (const { t, f } of extrema) {
      if (f < yMin || f > yMax) continue
      const cx = tToX(t), cy = yToY(f)
      ctx.fillStyle = '#c07840'
      ctx.beginPath()
      ctx.moveTo(cx, cy - 5); ctx.lineTo(cx + 4, cy); ctx.lineTo(cx, cy + 5); ctx.lineTo(cx - 4, cy)
      ctx.closePath(); ctx.fill()
    }

    // ── Roots ─────────────────────────────────────────────────────
    for (const rt of roots) {
      if (rt < tMin || rt > tMax) continue
      const cx = tToX(rt)
      ctx.strokeStyle = '#4ecca3'
      ctx.lineWidth = 1
      ctx.setLineDash([3, 3])
      ctx.beginPath(); ctx.moveTo(cx, pT); ctx.lineTo(cx, pT + ph); ctx.stroke()
      ctx.setLineDash([])

      ctx.shadowColor = '#4ecca3'; ctx.shadowBlur = 5
      ctx.fillStyle = '#4ecca3'
      ctx.beginPath(); ctx.arc(cx, zeroY, 4, 0, Math.PI * 2); ctx.fill()
      ctx.shadowBlur = 0

      ctx.fillStyle = '#4ecca3'
      ctx.font = 'bold 9px Courier New'
      ctx.textAlign = 'center'
      ctx.fillText(`t=${rt.toFixed(2)}`, cx, pT + ph + 22)
    }

    // ── Plot border ───────────────────────────────────────────────
    ctx.strokeStyle = '#2a2a42'
    ctx.lineWidth = 1
    ctx.strokeRect(pL, pT, pw, ph)

    // ── Y axis labels ─────────────────────────────────────────────
    ctx.font = '9px Courier New'
    ctx.textAlign = 'right'

    // Nice ticks (normal dim labels)
    ctx.fillStyle = '#555'
    for (const yv of yTicks.nice) {
      const cy = yToY(yv)
      if (cy < pT - 2 || cy > pT + ph + 2) continue
      ctx.fillText(fmtY(yv), pL - 5, cy + 3)
      ctx.strokeStyle = '#2a2a42'; ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(pL - 3, cy); ctx.lineTo(pL, cy); ctx.stroke()
    }

    // fMin label (orange, bottom of y)
    drawExtremeLabel(ctx, fMin, pL, yToY(fMin), 'min', '#c07840')
    // fMax label (orange, top of y)
    drawExtremeLabel(ctx, fMax, pL, yToY(fMax), 'max', '#c07840')

    // ── X axis labels ─────────────────────────────────────────────
    ctx.fillStyle = '#555'
    ctx.font = '9px Courier New'
    ctx.textAlign = 'center'
    for (const tv of tTicks) {
      const cx = tToX(tv)
      ctx.fillText(tv.toFixed(1), cx, pT + ph + 13)
      ctx.strokeStyle = '#2a2a42'; ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(cx, pT + ph); ctx.lineTo(cx, pT + ph + 3); ctx.stroke()
    }

    // ── Axis titles ───────────────────────────────────────────────
    ctx.fillStyle = '#555'
    ctx.font = '10px Courier New'
    ctx.textAlign = 'left'
    ctx.fillText('t →', pL + pw - 26, pT + ph + 31)

    ctx.save()
    ctx.translate(11, pT + ph / 2)
    ctx.rotate(-Math.PI / 2)
    ctx.textAlign = 'center'
    ctx.fillText('f(t)', 0, 0)
    ctx.restore()

    // ── Tiny coefficient readout ──────────────────────────────────
    const c = coeffs
    ctx.fillStyle = '#2f2f48'
    ctx.font = '8px Courier New'
    ctx.textAlign = 'left'
    ctx.fillText(
      `c₄=${fmtC(c.c4)}  c₃=${fmtC(c.c3)}  c₂=${fmtC(c.c2)}  c₁=${fmtC(c.c1)}  c₀=${fmtC(c.c0)}`,
      pL + 4, pT + 10,
    )
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────

function drawExtremeLabel(
  ctx: CanvasRenderingContext2D,
  value: number,
  leftEdge: number,
  cy: number,
  tag: 'min' | 'max',
  color: string,
) {
  // Don't draw if out of plot area
  if (!Number.isFinite(cy)) return
  ctx.save()

  // Short dashed leader from axis
  ctx.strokeStyle = color
  ctx.lineWidth = 0.8
  ctx.setLineDash([2, 3])
  ctx.beginPath()
  ctx.moveTo(leftEdge - 3, cy)
  ctx.lineTo(leftEdge + 6, cy)
  ctx.stroke()
  ctx.setLineDash([])

  // Label: "max 123.4" to the left of axis
  const label = `${tag} ${fmtY(value)}`
  ctx.fillStyle = color
  ctx.font = 'bold 8px Courier New'
  ctx.textAlign = 'right'
  // Offset label vertically so it doesn't overlap a nice tick
  const yOff = tag === 'max' ? -3 : 10
  ctx.fillText(label, leftEdge - 5, cy + yOff)

  ctx.restore()
}

interface YTicks { nice: number[] }

function makeYTicks(yMin: number, yMax: number, fMin: number, fMax: number, pxH: number): YTicks {
  const target = Math.max(3, Math.floor(pxH / 45))
  const niceAll = niceTicks(yMin, yMax, target)
  // Always include 0 if it's inside the range
  const set = new Set<number>(niceAll)
  if (yMin <= 0 && 0 <= yMax) set.add(0)
  const nice = [...set]
    .filter(v => v >= yMin && v <= yMax)
    // Exclude values too close to fMin/fMax extremes (those get their own label)
    .filter(v => Math.abs(v - fMin) > (yMax - yMin) * 0.04 && Math.abs(v - fMax) > (yMax - yMin) * 0.04)
    .sort((a, b) => a - b)
  return { nice }
}

function niceTicks(lo: number, hi: number, n: number): number[] {
  if (lo >= hi) return [lo]
  const span = hi - lo
  const raw  = span / Math.max(1, n)
  const mag  = Math.pow(10, Math.floor(Math.log10(raw)))
  const norm = raw / mag
  const step = norm < 1.5 ? mag : norm < 3.5 ? 2 * mag : norm < 7.5 ? 5 * mag : 10 * mag
  const start = Math.ceil(lo / step) * step
  const result: number[] = []
  for (let v = start; v <= hi + step * 0.01; v += step) {
    result.push(parseFloat(v.toPrecision(10)))
  }
  return result
}

function findExtrema(coeffs: QuarticCoeffs, ts: number[]): Array<{ t: number; f: number }> {
  const out: Array<{ t: number; f: number }> = []
  let prev = evalQuarticDeriv(coeffs, ts[0])
  for (let i = 1; i < ts.length; i++) {
    const cur = evalQuarticDeriv(coeffs, ts[i])
    if (prev * cur < 0) {
      // Bisect the sign-change interval for the derivative zero
      let a = ts[i - 1], b = ts[i]
      for (let k = 0; k < 30; k++) {
        const m = (a + b) / 2
        if (evalQuarticDeriv(coeffs, a) * evalQuarticDeriv(coeffs, m) < 0) b = m
        else a = m
      }
      const t = (a + b) / 2
      out.push({ t, f: evalQuartic(coeffs, t) })
    }
    prev = cur
  }
  return out
}

function fmtY(v: number): string {
  if (!Number.isFinite(v)) return '?'
  if (v === 0) return '0'
  const a = Math.abs(v)
  if (a >= 1e6 || (a < 0.001 && a > 0)) return v.toExponential(2)
  if (a >= 1000) return v.toFixed(0)
  if (a >= 10)   return v.toFixed(1)
  return v.toFixed(2)
}

function fmtC(v: number): string {
  return Math.abs(v) >= 1000 || (Math.abs(v) < 0.01 && v !== 0) ? v.toExponential(1) : v.toFixed(2)
}
