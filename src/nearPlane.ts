/**
 * Near Plane interactive 2D canvas.
 * Shows the near plane as a rectangle with the current ray hit point.
 * User can click or drag to move the ray hit point.
 */

export class NearPlaneView {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private onChangeCallback: ((x: number, y: number) => void) | null = null

  // Ray target in world units on near plane (centred at 0,0)
  rayX = 0
  rayY = 0

  // Display range
  rangeX = 2.5
  rangeY = 2.5

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')!
    this.attachEvents()
  }

  onChange(cb: (x: number, y: number) => void) { this.onChangeCallback = cb }

  private attachEvents() {
    const handle = (e: MouseEvent | TouchEvent) => {
      e.preventDefault()
      const rect = this.canvas.getBoundingClientRect()
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY
      const fx = (clientX - rect.left) / rect.width
      const fy = (clientY - rect.top) / rect.height
      this.rayX = (fx - 0.5) * 2 * this.rangeX
      this.rayY = -(fy - 0.5) * 2 * this.rangeY
      this.rayX = Math.max(-this.rangeX, Math.min(this.rangeX, this.rayX))
      this.rayY = Math.max(-this.rangeY, Math.min(this.rangeY, this.rayY))
      this.onChangeCallback?.(this.rayX, this.rayY)
      this.draw()
    }

    let dragging = false
    this.canvas.addEventListener('mousedown', (e) => { dragging = true; handle(e) })
    window.addEventListener('mousemove', (e) => { if (dragging) handle(e) })
    window.addEventListener('mouseup', () => { dragging = false })
    this.canvas.addEventListener('touchstart', handle, { passive: false })
    this.canvas.addEventListener('touchmove', handle, { passive: false })
  }

  draw(hitPoints?: Array<{ x: number; y: number }>) {
    const { canvas, ctx } = this
    const W = canvas.width
    const H = canvas.height

    ctx.fillStyle = '#0a0a1a'
    ctx.fillRect(0, 0, W, H)

    const PAD = 12
    const pw = W - 2 * PAD
    const ph = H - 2 * PAD

    // Near plane boundary
    ctx.strokeStyle = '#2a4a6a'
    ctx.lineWidth = 1.5
    ctx.strokeRect(PAD, PAD, pw, ph)

    // Grid lines
    ctx.strokeStyle = '#161628'
    ctx.lineWidth = 1
    ctx.beginPath()
    // Vertical centre
    ctx.moveTo(PAD + pw / 2, PAD)
    ctx.lineTo(PAD + pw / 2, PAD + ph)
    // Horizontal centre
    ctx.moveTo(PAD, PAD + ph / 2)
    ctx.lineTo(PAD + pw, PAD + ph / 2)
    ctx.stroke()

    // Minor grid (quarters)
    ctx.strokeStyle = '#111120'
    ctx.beginPath()
    for (const f of [0.25, 0.75]) {
      ctx.moveTo(PAD + pw * f, PAD)
      ctx.lineTo(PAD + pw * f, PAD + ph)
      ctx.moveTo(PAD, PAD + ph * f)
      ctx.lineTo(PAD + pw, PAD + ph * f)
    }
    ctx.stroke()

    const toCanvasX = (x: number) => PAD + ((x / this.rangeX + 1) / 2) * pw
    const toCanvasY = (y: number) => PAD + ((-y / this.rangeY + 1) / 2) * ph

    // Crosshair at ray point
    const cx = toCanvasX(this.rayX)
    const cy = toCanvasY(this.rayY)

    ctx.strokeStyle = 'rgba(78,204,163,0.4)'
    ctx.lineWidth = 1
    ctx.setLineDash([2, 3])
    ctx.beginPath()
    ctx.moveTo(cx, PAD)
    ctx.lineTo(cx, PAD + ph)
    ctx.moveTo(PAD, cy)
    ctx.lineTo(PAD + pw, cy)
    ctx.stroke()
    ctx.setLineDash([])

    // Ray target dot with glow
    const hasHit = hitPoints && hitPoints.length > 0
    const dotColor = hasHit ? '#4ecca3' : '#ff6b6b'
    ctx.shadowColor = dotColor
    ctx.shadowBlur = 8
    ctx.fillStyle = dotColor
    ctx.beginPath()
    ctx.arc(cx, cy, 5, 0, Math.PI * 2)
    ctx.fill()
    ctx.shadowBlur = 0

    // Small circle outline
    ctx.strokeStyle = dotColor
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.arc(cx, cy, 9, 0, Math.PI * 2)
    ctx.stroke()

    // Coordinate label
    ctx.fillStyle = '#7ec8e3'
    ctx.font = '10px Courier New'
    ctx.textAlign = 'left'
    const lx = cx + 12
    const ly = cy - 4
    const txt = `(${this.rayX.toFixed(2)}, ${this.rayY.toFixed(2)})`
    ctx.fillText(txt, Math.min(lx, W - PAD - txt.length * 6.5), ly < PAD + 14 ? cy + 14 : ly)

    // Axis labels
    ctx.fillStyle = '#333'
    ctx.font = '10px Courier New'
    ctx.textAlign = 'center'
    ctx.fillText('X', PAD + pw - 6, PAD + ph / 2 - 4)
    ctx.fillText('Y', PAD + pw / 2 + 10, PAD + 10)
  }
}
