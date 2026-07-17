// GMGN-style trade badges drawn on the candle series as a custom primitive:
// filled letter-circles (DB dev-bought, DS dev-sold, B/S your own trades, M migrated)
// with an optional count sub-badge. Built-in markers can't render this, hence the primitive.
import type {
  ISeriesPrimitive, IPrimitivePaneView, IPrimitivePaneRenderer,
  SeriesAttachedParameter, Time, IChartApi, ISeriesApi, SeriesType,
} from 'lightweight-charts'
import type { CanvasRenderingTarget2D } from 'fancy-canvas'

export type Badge = {
  time: number    // bucket start (unix seconds)
  price: number   // series value (mcap) used to anchor the badge vertically
  code: string    // 'DB' | 'DS' | 'B' | 'S' | 'M'
  fill: string    // circle colour
  ring?: boolean  // white ring = the viewer's own trade
  count?: number  // aggregated trades in the cluster
  below?: boolean // sit below the bar (buys) vs above (sells)
}

type Placed = { x: number; y: number; code: string; fill: string; ring: boolean; count?: number }

const RING = '#ffffff'
const R = 8    // badge radius (media px)
const OFF = 16 // offset off the bar so badges never overlap the candle

// a deeper shade of the badge's own colour, used as its halo/outline
function darken(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16)
  return `rgb(${Math.round(((n >> 16) & 255) * f)},${Math.round(((n >> 8) & 255) * f)},${Math.round((n & 255) * f)})`
}

class BadgesRenderer implements IPrimitivePaneRenderer {
  constructor(private items: Placed[]) {}
  draw(target: CanvasRenderingTarget2D) {
    target.useBitmapCoordinateSpace((scope) => {
      const ctx = scope.context
      const hr = scope.horizontalPixelRatio
      const vr = scope.verticalPixelRatio
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      for (const it of this.items) {
        const x = it.x * hr, y = it.y * vr, r = R * hr
        // halo = a deeper shade of the badge's own colour → separates it from same-colour candles
        ctx.beginPath(); ctx.arc(x, y, r + 2.5 * hr, 0, Math.PI * 2); ctx.fillStyle = darken(it.fill, 0.4); ctx.fill()
        // colour disc
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = it.fill; ctx.fill()
        // white ring marks the viewer's own trades
        if (it.ring) { ctx.beginPath(); ctx.arc(x, y, r + 1.2 * hr, 0, Math.PI * 2); ctx.lineWidth = 1.6 * hr; ctx.strokeStyle = RING; ctx.stroke() }
        ctx.fillStyle = '#fff'
        ctx.font = `700 ${(it.code.length > 1 ? 8.5 : 10.5) * hr}px ui-sans-serif, system-ui, sans-serif`
        ctx.fillText(it.code, x, y + 0.5 * vr)
        if (it.count && it.count > 1) {
          const bx = x + r * 0.8, by = y - r * 0.8, br = 6 * hr
          ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2)
          ctx.fillStyle = '#0B0A08'; ctx.fill()
          ctx.fillStyle = '#fff'
          ctx.font = `700 ${7.5 * hr}px ui-sans-serif, system-ui, sans-serif`
          ctx.fillText(String(Math.min(it.count, 99)), bx, by + 0.5 * vr)
        }
      }
    })
  }
}

class BadgesView implements IPrimitivePaneView {
  private items: Placed[] = []
  constructor(private src: TradeBadges) {}
  zOrder() { return 'top' as const }
  renderer() { return new BadgesRenderer(this.items) }
  update() {
    const { chart, series, badges } = this.src.state()
    if (!chart || !series) { this.items = []; return }
    const ts = chart.timeScale()
    // Highest-value badges win the space: your own > bigger clusters > more recent.
    const sorted = [...badges].sort((a, b) =>
      (Number(!!b.ring) - Number(!!a.ring)) || ((b.count ?? 1) - (a.count ?? 1)) || (b.time - a.time))
    const kept: Placed[] = []
    const MIN = 2 * R + 6 // min centre distance (media px) → always leaves a gap
    for (const b of sorted) {
      const x = ts.timeToCoordinate(b.time as Time)
      const y0 = series.priceToCoordinate(b.price)
      if (x == null || y0 == null) continue
      const px = x as number, py = (y0 as number) + (b.below ? OFF : -OFF)
      // skip any badge that would collide with one already placed → no overlap, ever
      if (kept.some((k) => { const dx = k.x - px, dy = k.y - py; return dx * dx + dy * dy < MIN * MIN })) continue
      kept.push({ x: px, y: py, code: b.code, fill: b.fill, ring: !!b.ring, count: b.count })
    }
    this.items = kept
  }
}

export class TradeBadges implements ISeriesPrimitive<Time> {
  private _chart: IChartApi | null = null
  private _series: ISeriesApi<SeriesType> | null = null
  private _req: (() => void) | null = null
  private _badges: Badge[] = []
  private _view = new BadgesView(this)

  attached(p: SeriesAttachedParameter<Time>) { this._chart = p.chart; this._series = p.series; this._req = p.requestUpdate }
  detached() { this._chart = null; this._series = null; this._req = null }
  setBadges(b: Badge[]) { this._badges = b; this._req?.() }
  state() { return { chart: this._chart, series: this._series, badges: this._badges } }
  updateAllViews() { this._view.update() }
  paneViews() { return [this._view] }
}
