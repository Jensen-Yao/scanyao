import { useEffect, useRef, useState } from 'preact/hooks'
import { Check, Flashlight, FlashlightOff, ImagePlus, Timer, Trash2, X, Zap } from 'lucide-preact'
import type { CornerSet } from '../core/geometry'
import { detectDocumentCorners } from '../core/imageEngine'

interface CameraSheetProps {
  onFinish: (files: File[]) => void
  onClose: () => void
  onSystemCamera: () => void
}

type CameraStatus = 'starting' | 'live' | 'denied' | 'unavailable'

interface CameraShot {
  file: File
  url: string
}

const DETECT_INTERVAL = 620
const AUTO_CAPTURE_STABLE_TICKS = 2
const AUTO_CAPTURE_COOLDOWN = 2600

function averageCornerDelta(a: CornerSet, b: CornerSet) {
  let total = 0
  for (let index = 0; index < 4; index += 1) {
    total += Math.hypot(a[index].x - b[index].x, a[index].y - b[index].y)
  }
  return total / 4
}

function quadrilateralArea(corners: CornerSet) {
  let area = 0
  for (let index = 0; index < corners.length; index += 1) {
    const current = corners[index]
    const next = corners[(index + 1) % corners.length]
    area += current.x * next.y - next.x * current.y
  }
  return Math.abs(area) / 2
}

/**
 * 应用内相机：实时取景 + 自动识别文档边缘 + 连拍多页 + 可选稳定自动拍摄。
 * 权限被拒或无摄像头时回退到系统相机。
 */
export function CameraSheet({ onFinish, onClose, onSystemCamera }: CameraSheetProps) {
  const [status, setStatus] = useState<CameraStatus>('starting')
  const [shots, setShots] = useState<CameraShot[]>([])
  const [autoCapture, setAutoCapture] = useState(false)
  const [torchOn, setTorchOn] = useState(false)
  const [torchAvailable, setTorchAvailable] = useState(false)
  const [quad, setQuad] = useState<CornerSet | null>(null)
  const [flash, setFlash] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const quadRef = useRef<CornerSet | null>(null)
  const stableTicks = useRef(0)
  const lastShotAt = useRef(0)
  const shotsRef = useRef<CameraShot[]>([])
  const autoRef = useRef(false)
  const statusRef = useRef<CameraStatus>('starting')
  const flashRef = useRef(false)
  shotsRef.current = shots
  autoRef.current = autoCapture
  statusRef.current = status
  flashRef.current = flash

  const capture = () => {
    const video = videoRef.current
    if (!video || !video.videoWidth || statusRef.current !== 'live') return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const context = canvas.getContext('2d')
    if (!context) return
    context.drawImage(video, 0, 0)
    canvas.toBlob((blob) => {
      if (!blob) return
      const file = new File([blob], `拍摄-${Date.now()}.jpg`, { type: 'image/jpeg' })
      setShots((current) => [...current, { file, url: URL.createObjectURL(file) }])
      navigator.vibrate?.(14)
      lastShotAt.current = Date.now()
      stableTicks.current = 0
      setFlash(true)
      window.setTimeout(() => setFlash(false), 170)
    }, 'image/jpeg', 0.92)
  }
  const captureRef = useRef(capture)
  captureRef.current = capture

  useEffect(() => {
    let disposed = false
    let detectTimer: number | undefined

    const start = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1440 } },
          audio: false,
        })
        if (disposed) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }
        streamRef.current = stream
        const video = videoRef.current
        if (video) {
          video.srcObject = stream
          await video.play().catch(() => undefined)
        }
        const [track] = stream.getVideoTracks()
        const capabilities = typeof track.getCapabilities === 'function' ? track.getCapabilities() : null
        if (capabilities && 'torch' in capabilities) setTorchAvailable(true)
        track.addEventListener('ended', () => setStatus('unavailable'))
        setStatus('live')

        const sample = document.createElement('canvas')
        const sampleContext = sample.getContext('2d', { willReadFrequently: true })
        detectTimer = window.setInterval(async () => {
          const liveVideo = videoRef.current
          if (disposed || !liveVideo || liveVideo.readyState < 2 || !sampleContext) return
          const scale = Math.min(1, 360 / Math.max(liveVideo.videoWidth, liveVideo.videoHeight))
          if (!scale || !Number.isFinite(scale)) return
          sample.width = Math.max(2, Math.round(liveVideo.videoWidth * scale))
          sample.height = Math.max(2, Math.round(liveVideo.videoHeight * scale))
          sampleContext.drawImage(liveVideo, 0, 0, sample.width, sample.height)
          try {
            const blob = await new Promise<Blob | null>((resolve) => sample.toBlob(resolve, 'image/jpeg', 0.6))
            if (!blob || disposed) return
            const url = URL.createObjectURL(blob)
            try {
              const detected = await detectDocumentCorners(url)
              const previous = quadRef.current
              const now = Date.now()
              quadRef.current = detected
              setQuad(detected)
              if (previous && quadrilateralArea(detected) > 0.18 && averageCornerDelta(detected, previous) < 0.02) {
                stableTicks.current += 1
                if (
                  autoRef.current
                  && stableTicks.current >= AUTO_CAPTURE_STABLE_TICKS
                  && now - lastShotAt.current > AUTO_CAPTURE_COOLDOWN
                ) captureRef.current()
              } else {
                stableTicks.current = 0
              }
            } finally {
              URL.revokeObjectURL(url)
            }
          } catch {
            // 单帧识别失败时保留上一次结果
          }
        }, DETECT_INTERVAL)
      } catch (error) {
        if (disposed) return
        const name = (error as DOMException)?.name
        setStatus(name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'unavailable')
      }
    }

    void start()
    return () => {
      disposed = true
      if (detectTimer) window.clearInterval(detectTimer)
      streamRef.current?.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
  }, [])

  // 把识别到的文档边缘画到取景覆盖层
  useEffect(() => {
    const draw = () => {
      const overlay = overlayRef.current
      const video = videoRef.current
      if (!overlay || !video || !video.videoWidth) return
      const bounds = overlay.getBoundingClientRect()
      if (bounds.width < 2 || bounds.height < 2) return
      const dpr = window.devicePixelRatio || 1
      overlay.width = Math.round(bounds.width * dpr)
      overlay.height = Math.round(bounds.height * dpr)
      const context = overlay.getContext('2d')
      if (!context) return
      context.setTransform(dpr, 0, 0, dpr, 0, 0)
      context.clearRect(0, 0, bounds.width, bounds.height)
      if (!quad) return
      // video 使用 object-fit: cover，需要换算裁剪偏移
      const scale = Math.max(bounds.width / video.videoWidth, bounds.height / video.videoHeight)
      const displayedWidth = video.videoWidth * scale
      const displayedHeight = video.videoHeight * scale
      const offsetX = (bounds.width - displayedWidth) / 2
      const offsetY = (bounds.height - displayedHeight) / 2
      const points = quad.map((point) => ({
        x: offsetX + point.x * displayedWidth,
        y: offsetY + point.y * displayedHeight,
      }))
      context.beginPath()
      context.moveTo(points[0].x, points[0].y)
      points.slice(1).forEach((point) => context.lineTo(point.x, point.y))
      context.closePath()
      context.fillStyle = 'rgba(48, 209, 88, 0.16)'
      context.fill()
      context.strokeStyle = '#30d158'
      context.lineWidth = 2.5
      context.stroke()
    }
    draw()
    const observer = new ResizeObserver(draw)
    if (overlayRef.current) observer.observe(overlayRef.current)
    return () => observer.disconnect()
  }, [quad, status])

  useEffect(() => () => {
    shotsRef.current.forEach((shot) => URL.revokeObjectURL(shot.url))
  }, [])

  const toggleTorch = async () => {
    const [track] = streamRef.current?.getVideoTracks() ?? []
    if (!track) return
    const next = !torchOn
    try {
      await track.applyConstraints({ advanced: [{ torch: next }] } as unknown as MediaTrackConstraints)
      setTorchOn(next)
    } catch {
      setTorchAvailable(false)
    }
  }

  const removeShot = (index: number) => {
    setShots((current) => {
      URL.revokeObjectURL(current[index].url)
      return current.filter((_, position) => position !== index)
    })
  }

  const finish = () => {
    const files = shotsRef.current.map((shot) => shot.file)
    shotsRef.current = []
    setShots([])
    if (files.length > 0) onFinish(files)
  }

  return (
    <div class="camera-sheet" role="dialog" aria-modal="true" aria-label="拍摄扫描件">
      <video ref={videoRef} class="camera-video" playsinline muted autoplay />
      <canvas ref={overlayRef} class="camera-overlay" aria-hidden="true" />
      {flash && <div class="camera-flash" />}
      <div class="camera-top">
        <button type="button" class="camera-tool" onClick={onClose} aria-label="关闭相机"><X size={19} /></button>
        <span class="camera-hint">
          {status === 'starting' && '正在启动相机…'}
          {status === 'live' && (quad ? '已识别文档边缘，保持稳定即可拍摄' : '将文档对准取景框')}
          {status === 'denied' && '相机权限被拒绝'}
          {status === 'unavailable' && '相机不可用'}
        </span>
        {torchAvailable && (
          <button type="button" class="camera-tool" onClick={() => void toggleTorch()} aria-label="切换手电筒">
            {torchOn ? <Flashlight size={19} /> : <FlashlightOff size={19} />}
          </button>
        )}
      </div>

      {(status === 'denied' || status === 'unavailable') && (
        <div class="camera-fallback">
          <p>{status === 'denied' ? '请在系统设置中允许扫耀使用相机，或直接调用系统相机拍摄。' : '未找到可用摄像头，可以调用系统相机拍摄。'}</p>
          <div class="camera-fallback-actions">
            <button type="button" class="primary-button" onClick={onSystemCamera}><ImagePlus size={17} />打开系统相机</button>
            <button type="button" class="quiet-button" onClick={onClose}>返回</button>
          </div>
        </div>
      )}

      <div class="camera-bottom">
        {shots.length > 0 && (
          <div class="camera-shot-strip">
            {shots.map((shot, index) => (
              <span class="camera-shot" key={shot.url}>
                <img src={shot.url} alt="" />
                <button type="button" onClick={() => removeShot(index)} aria-label="删除这张拍摄"><Trash2 size={12} /></button>
              </span>
            ))}
          </div>
        )}
        <div class="camera-controls">
          <button
            type="button"
            class={autoCapture ? 'camera-tool active' : 'camera-tool'}
            onClick={() => { setAutoCapture(!autoCapture); stableTicks.current = 0 }}
            aria-label="稳定时自动拍摄"
            title="识别到文档且画面稳定时自动拍摄"
          ><Timer size={18} /><span>自动</span></button>
          <button
            type="button"
            class={flash ? 'camera-shutter firing' : 'camera-shutter'}
            onClick={capture}
            disabled={status !== 'live'}
            aria-label="拍摄"
          />
          <button
            type="button"
            class="camera-finish"
            onClick={finish}
            disabled={shots.length === 0}
          ><Check size={17} />完成{shots.length > 0 ? ` (${shots.length})` : ''}</button>
        </div>
        <p class="camera-tip"><Zap size={12} />连续拍摄多页后点“完成”，全部进入工作台</p>
      </div>
    </div>
  )
}
