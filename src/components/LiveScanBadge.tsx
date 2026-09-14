import { useEffect, useRef, useState } from 'preact/hooks'
import { Maximize2, ScanLine } from 'lucide-preact'
import type { ScanPage } from '../types'
import { filterStrengthFor } from '../core/document'
import { renderScan } from '../core/imageEngine'

interface LiveScanBadgeProps {
  page: ScanPage
  onOpen: () => void
}

/**
 * 校正模式下悬浮的实时扫描预览：拖动四角、切换滤镜或微调参数时，
 * 节流渲染“透视校正 + 当前滤镜”的真实结果，让用户框选后立刻看到扫描件效果。
 */
export function LiveScanBadge({ page, onOpen }: LiveScanBadgeProps) {
  const [result, setResult] = useState<{ url: string; width: number; height: number } | null>(null)
  const [pending, setPending] = useState(true)
  const latestUrl = useRef<string | null>(null)

  useEffect(() => {
    let disposed = false
    setPending(true)
    const timer = window.setTimeout(() => {
      void renderScan(
        page.sourceUrl,
        page.corners,
        page.rotation,
        page.filter,
        filterStrengthFor(page),
        380,
        0.74,
        page.adjustments,
        page.flipX,
        page.flipY,
      ).then((rendered) => {
        if (disposed) {
          URL.revokeObjectURL(rendered.url)
          return
        }
        if (latestUrl.current) URL.revokeObjectURL(latestUrl.current)
        latestUrl.current = rendered.url
        setResult({ url: rendered.url, width: rendered.width, height: rendered.height })
        setPending(false)
      }).catch(() => {
        if (!disposed) setPending(false)
      })
    }, 200)
    return () => {
      disposed = true
      window.clearTimeout(timer)
    }
  }, [page.id, page.sourceUrl, page.corners, page.rotation, page.flipX, page.flipY, page.filter, page.filterStrengths, page.adjustments])

  useEffect(() => () => {
    if (latestUrl.current) URL.revokeObjectURL(latestUrl.current)
  }, [])

  return (
    <button type="button" class="live-scan-badge" onClick={onOpen} aria-label="查看实时扫描预览" title="点击查看扫描结果">
      <span class="live-scan-thumb">
        {result ? <img src={result.url} alt="实时扫描预览" /> : <span class="live-scan-placeholder"><ScanLine size={18} /></span>}
        {pending && result && <span class="live-scan-refresh" />}
      </span>
      <span class="live-scan-caption"><ScanLine size={13} />实时预览<Maximize2 size={11} /></span>
    </button>
  )
}
