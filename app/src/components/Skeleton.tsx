import type { CSSProperties } from 'react'

// Shimmer placeholder for loading states (kills blank-screen flashes).
export function Skeleton({ className = '', w, h, r, style }: {
  className?: string; w?: number | string; h?: number | string; r?: number | string; style?: CSSProperties
}) {
  return <span className={`skel ${className}`} style={{ width: w, height: h, borderRadius: r, ...style }} aria-hidden />
}

// A board of placeholder cards while the token list loads.
export function BoardSkeleton() {
  return (
    <div className="board">
      {Array.from({ length: 5 }).map((_, i) => (
        <div className="bcard" key={i} style={{ pointerEvents: 'none' }}>
          <div className="bcard-head">
            <Skeleton className="bcard-img" />
            <div className="bcard-meta" style={{ display: 'grid', gap: 6 }}>
              <Skeleton w="60%" h={12} />
              <Skeleton w="40%" h={10} />
            </div>
          </div>
          <Skeleton w="55%" h={22} style={{ marginTop: 'var(--s3)' }} />
          <Skeleton h={5} r={999} style={{ marginTop: 'var(--s2)' }} />
        </div>
      ))}
    </div>
  )
}
