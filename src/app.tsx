import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks'
import {
  Aperture, Archive, Check, ChevronDown, Combine, Copy, Download, FileBadge, FileImage,
  FilePlus2, FileText, FlipHorizontal2, FlipVertical2, Grid2X2, ImagePlus, Images, Layers3,
  History, Monitor, Moon, MoreHorizontal, Newspaper, NotebookPen, Redo2, RotateCcw, RotateCw,
  ScanLine, ScanText, ScrollText, Settings2, Sparkles, Sun, Trash2, Undo2, Upload,
  WandSparkles,
} from 'lucide-preact'
import { CropCanvas } from './components/CropCanvas'
import { ExportSheet } from './components/ExportSheet'
import { HistorySheet, type ActivityRecord } from './components/HistorySheet'
import { ImportChoiceSheet } from './components/ImportChoiceSheet'
import { PageManager } from './components/PageManager'
import { RangeControl } from './components/RangeControl'
import {
  SourceMergeSheet,
  type MergeInitialItem,
  type MergeStudioResult,
} from './components/SourceMergeSheet'
import { copyPageSettings, fileStem, movePage } from './core/document'
import { composePlacedScans, composeScans } from './core/compositor'
import { DEFAULT_CORNERS, type CornerSet } from './core/geometry'
import { DEFAULT_ADJUSTMENTS, DEFAULT_FILTER_STRENGTHS, detectDocumentCorners, renderScan, type FilterId } from './core/imageEngine'
import { createPdf } from './core/pdf'
import { saveBlob } from './core/platform'
import { clearSession, loadSession, saveSession } from './core/session'
import { createZip } from './core/zip'
import type { ExportOptions, ExportQuality, ScanDocument, ScanPage } from './types'
import './app.css'

type EditorMode = 'crop' | 'filter'
type Theme = 'light' | 'dark'
type SaveState = 'loading' | 'saving' | 'saved' | 'error'
type FilterCategoryId = 'recommended' | 'documents' | 'receipts' | 'scenes'

interface HistoryState {
  past: ScanDocument[]
  future: ScanDocument[]
}

interface MergeSession {
  initialItems: MergeInitialItem[]
  replacePageIds: string[]
}

const FILTER_CATEGORIES: { id: FilterCategoryId; label: string }[] = [
  { id: 'recommended', label: '推荐' },
  { id: 'documents', label: '文档' },
  { id: 'receipts', label: '票证' },
  { id: 'scenes', label: '场景' },
]

const FILTERS: { id: FilterId; label: string; icon: typeof FileText; hint: string; category: FilterCategoryId }[] = [
  { id: 'auto', label: '自动', icon: WandSparkles, hint: '根据纸张与色彩自动优化', category: 'recommended' },
  { id: 'clean', label: '文档', icon: FileText, hint: '提亮纸张并拉开层次', category: 'recommended' },
  { id: 'enhance', label: '增强', icon: Sparkles, hint: '提升对比', category: 'recommended' },
  { id: 'color', label: '彩色', icon: ImagePlus, hint: '增强彩色文字与印章', category: 'recommended' },
  { id: 'text', label: '文字', icon: ScanText, hint: '强化黑色印刷文字', category: 'documents' },
  { id: 'shadow', label: '去阴影', icon: Moon, hint: '均衡纸张局部光照', category: 'documents' },
  { id: 'book', label: '书页', icon: Layers3, hint: '减轻书脊与页边阴影', category: 'documents' },
  { id: 'newspaper', label: '报纸', icon: Newspaper, hint: '去黄并强化密集小字', category: 'documents' },
  { id: 'notes', label: '手写', icon: NotebookPen, hint: '保留蓝黑笔迹并提亮纸张', category: 'documents' },
  { id: 'bw', label: '黑白', icon: FileText, hint: '纯黑白文档', category: 'documents' },
  { id: 'receipt', label: '票据', icon: Archive, hint: '强化小字与浅色底纹', category: 'receipts' },
  { id: 'invoice', label: '发票', icon: ScrollText, hint: '保留彩色章并强化票面文字', category: 'receipts' },
  { id: 'card', label: '名片', icon: Grid2X2, hint: '强化小字并保留品牌色', category: 'receipts' },
  { id: 'id', label: '证件', icon: FileBadge, hint: '温和保留人像与证件底色', category: 'receipts' },
  { id: 'certificate', label: '证书', icon: FileBadge, hint: '保留底纹、照片与印章', category: 'receipts' },
  { id: 'stamp', label: '印章', icon: Check, hint: '突出红蓝印章与签字', category: 'receipts' },
  { id: 'photo', label: '照片', icon: Aperture, hint: '轻度改善照片色彩', category: 'scenes' },
  { id: 'whiteboard', label: '白板', icon: Sun, hint: '提亮白板并保留彩色笔迹', category: 'scenes' },
  { id: 'blueprint', label: '蓝图', icon: ScanLine, hint: '强化工程图线条', category: 'scenes' },
  { id: 'screen', label: '屏幕', icon: Monitor, hint: '轻度平滑屏摄摩尔纹', category: 'scenes' },
  { id: 'grayscale', label: '灰度', icon: ScanLine, hint: '低饱和灰阶', category: 'scenes' },
  { id: 'original', label: '原图', icon: FileImage, hint: '保留原色', category: 'scenes' },
]

const QUALITY_PROFILES: Record<ExportQuality, { maxDimension: number; jpegQuality: number }> = {
  compact: { maxDimension: 1800, jpegQuality: 0.8 },
  balanced: { maxDimension: 2800, jpegQuality: 0.9 },
  best: { maxDimension: 3600, jpegQuality: 0.96 },
}

const DEFAULT_EXPORT_OPTIONS: ExportOptions = { quality: 'balanced', pageSize: 'a4', margin: false, mergeLayout: 'vertical' }
const emptyDocument = (): ScanDocument => ({ title: '未命名扫描', pages: [], selectedId: null })
const idFor = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`
const cloneCorners = (corners: CornerSet) => corners.map((corner) => ({ ...corner })) as CornerSet
const MERGED_CORNERS: CornerSet = [{ x: 0.01, y: 0.01 }, { x: 0.99, y: 0.01 }, { x: 0.99, y: 0.99 }, { x: 0.01, y: 0.99 }]
const filterStrengthFor = (page: ScanPage, filter = page.filter) => page.filterStrengths?.[filter] ?? DEFAULT_FILTER_STRENGTHS[filter]

function loadExportOptions() {
  try {
    return { ...DEFAULT_EXPORT_OPTIONS, ...JSON.parse(localStorage.getItem('scanyao-export') ?? '{}') } as ExportOptions
  } catch {
    return DEFAULT_EXPORT_OPTIONS
  }
}

function initialTheme(): Theme {
  const saved = localStorage.getItem('scanyao-theme') as Theme | null
  if (saved === 'light' || saved === 'dark') return saved
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function initialPreviewRatio() {
  const saved = Number(localStorage.getItem('scanyao-preview-ratio'))
  return Number.isFinite(saved) && saved >= 44 && saved <= 68 ? saved : 55
}

export function App() {
  const [theme, setTheme] = useState<Theme>(initialTheme)
  const [previewRatio, setPreviewRatio] = useState(initialPreviewRatio)
  const [scanDocument, setScanDocument] = useState<ScanDocument>(emptyDocument)
  const [history, setHistory] = useState<HistoryState>({ past: [], future: [] })
  const [mode, setMode] = useState<EditorMode>('crop')
  const [preview, setPreview] = useState<{ id: string; url: string; width: number; height: number } | null>(null)
  const [busyLabel, setBusyLabel] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [exportOpen, setExportOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [activityLog, setActivityLog] = useState<ActivityRecord[]>([])
  const [pageManagerOpen, setPageManagerOpen] = useState(false)
  const [importChoiceOpen, setImportChoiceOpen] = useState(false)
  const [pendingImportFiles, setPendingImportFiles] = useState<File[]>([])
  const [mergeSession, setMergeSession] = useState<MergeSession | null>(null)
  const [filterCategory, setFilterCategory] = useState<FilterCategoryId>('recommended')
  const [exportOptions, setExportOptions] = useState<ExportOptions>(loadExportOptions)
  const [saveState, setSaveState] = useState<SaveState>('loading')
  const [hydrated, setHydrated] = useState(false)
  const documentRef = useRef(scanDocument)
  const transactionRef = useRef<ScanDocument | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const cameraInput = useRef<HTMLInputElement>(null)
  const filterStrip = useRef<HTMLDivElement>(null)
  const filterButtons = useRef<Partial<Record<FilterId, HTMLButtonElement>>>({})
  const { pages, selectedId } = scanDocument
  const activePage = useMemo(() => pages.find((page) => page.id === selectedId) ?? null, [pages, selectedId])
  const busy = busyLabel !== null

  const updateDocument = useCallback((updater: (current: ScanDocument) => ScanDocument) => {
    setScanDocument((current) => {
      const next = updater(current)
      documentRef.current = next
      return next
    })
  }, [])

  const recordActivity = useCallback((label: string) => {
    setActivityLog((current) => [...current.slice(-39), { id: idFor(), label, at: Date.now() }])
  }, [])

  const commitDocument = useCallback((updater: (current: ScanDocument) => ScanDocument, label = '编辑当前文档') => {
    setScanDocument((current) => {
      const next = updater(current)
      if (next === current) return current
      setHistory((value) => ({ past: [...value.past.slice(-29), current], future: [] }))
      recordActivity(label)
      documentRef.current = next
      return next
    })
  }, [recordActivity])

  const beginTransaction = useCallback(() => {
    if (!transactionRef.current) transactionRef.current = documentRef.current
  }, [])

  const endTransaction = useCallback(() => {
    const before = transactionRef.current
    transactionRef.current = null
    if (!before || before === documentRef.current) return
    setHistory((value) => ({ past: [...value.past.slice(-29), before], future: [] }))
    recordActivity('连续调节页面')
  }, [recordActivity])

  const undo = useCallback(() => {
    setHistory((current) => {
      const previous = current.past.at(-1)
      if (!previous) return current
      const now = documentRef.current
      documentRef.current = previous
      setScanDocument(previous)
      recordActivity('撤销上一步')
      navigator.vibrate?.(7)
      return { past: current.past.slice(0, -1), future: [now, ...current.future].slice(0, 30) }
    })
  }, [recordActivity])

  const redo = useCallback(() => {
    setHistory((current) => {
      const next = current.future[0]
      if (!next) return current
      const now = documentRef.current
      documentRef.current = next
      setScanDocument(next)
      recordActivity('重做上一步')
      navigator.vibrate?.(7)
      return { past: [...current.past.slice(-29), now], future: current.future.slice(1) }
    })
  }, [recordActivity])

  useEffect(() => {
    window.document.documentElement.dataset.theme = theme
    localStorage.setItem('scanyao-theme', theme)
  }, [theme])

  useEffect(() => {
    localStorage.setItem('scanyao-preview-ratio', String(previewRatio))
  }, [previewRatio])

  useEffect(() => {
    localStorage.setItem('scanyao-export', JSON.stringify(exportOptions))
  }, [exportOptions])

  useEffect(() => {
    let disposed = false
    let failed = false
    void loadSession()
      .then((restored) => {
        if (disposed || !restored) return
        documentRef.current = restored
        setScanDocument(restored)
        setToast(`已恢复 ${restored.pages.length} 页本地文档`)
      })
      .catch(() => {
        failed = true
        if (!disposed) setSaveState('error')
      })
      .finally(() => {
        if (!disposed) {
          setHydrated(true)
          if (!failed) setSaveState('saved')
        }
      })
    return () => { disposed = true }
  }, [])

  useEffect(() => {
    if (!hydrated) return
    setSaveState('saving')
    const timeout = window.setTimeout(() => {
      void saveSession(scanDocument)
        .then(() => setSaveState('saved'))
        .catch(() => setSaveState('error'))
    }, 650)
    return () => window.clearTimeout(timeout)
  }, [scanDocument, hydrated])

  useEffect(() => {
    if (!activePage) {
      setPreview((previous) => {
        if (previous) URL.revokeObjectURL(previous.url)
        return null
      })
      return
    }
    let disposed = false
    const timer = window.setTimeout(() => {
      void renderScan(
        activePage.sourceUrl,
        activePage.corners,
        activePage.rotation,
        activePage.filter,
        filterStrengthFor(activePage),
        1500,
        0.82,
        activePage.adjustments,
        activePage.flipX,
        activePage.flipY,
      ).then((result) => {
        if (disposed) {
          URL.revokeObjectURL(result.url)
          return
        }
        setPreview((previous) => {
          if (previous && previous.url !== result.url) URL.revokeObjectURL(previous.url)
          return { id: activePage.id, url: result.url, width: result.width, height: result.height }
        })
      }).catch(() => setToast('预览生成失败，请换一张图片再试。'))
    }, 110)
    return () => {
      disposed = true
      window.clearTimeout(timer)
    }
  }, [activePage])

  useEffect(() => {
    if (!activePage) return
    const category = FILTERS.find((filter) => filter.id === activePage.filter)?.category ?? 'recommended'
    setFilterCategory(category)
    const frame = window.requestAnimationFrame(() => {
      filterButtons.current[activePage.filter]?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [activePage?.filter])

  useEffect(() => {
    if (!toast) return
    const timeout = window.setTimeout(() => setToast(null), 2800)
    return () => window.clearTimeout(timeout)
  }, [toast])

  const updateActive = useCallback((patch: Partial<ScanPage>, addToHistory = true, label = '调整当前页') => {
    const apply = (current: ScanDocument): ScanDocument => {
      if (!current.selectedId) return current
      return {
        ...current,
        pages: current.pages.map((page) => (page.id === current.selectedId ? { ...page, ...patch } : page)),
      }
    }
    if (addToHistory) commitDocument(apply, label)
    else updateDocument(apply)
  }, [commitDocument, updateDocument])

  const addFiles = useCallback(async (files: FileList | File[]) => {
    const imageFiles = Array.from(files).filter((file) => file.type.startsWith('image/'))
    if (imageFiles.length === 0) {
      setToast('请选择设备支持的 JPG、PNG 或图片文件。')
      return
    }
    setBusyLabel('正在识别页面')
    const added: ScanPage[] = []
    try {
      for (const file of imageFiles) {
        const sourceUrl = URL.createObjectURL(file)
        try {
          const corners = await detectDocumentCorners(sourceUrl)
          added.push({
            id: idFor(),
            fileName: file.name,
            sourceUrl,
            sourceFile: file,
            corners,
            rotation: 0,
            flipX: false,
            flipY: false,
            filter: 'auto',
            filterStrengths: {},
            adjustments: { ...DEFAULT_ADJUSTMENTS },
            createdAt: Date.now(),
          })
        } catch {
          URL.revokeObjectURL(sourceUrl)
        }
      }
      if (added.length === 0) throw new Error('没有可读取的图片')
      commitDocument((current) => ({
        title: current.pages.length === 0 ? fileStem(added[0].fileName) : current.title,
        pages: [...current.pages, ...added],
        selectedId: added[0].id,
      }), `导入 ${added.length} 页图片`)
      setMode('crop')
      setToast(`${added.length} 页已加入工作台`)
      navigator.vibrate?.(10)
    } catch {
      setToast('读取图片失败，请检查文件格式。')
    } finally {
      setBusyLabel(null)
    }
  }, [commitDocument])

  const onInputChange = (event: Event) => {
    const input = event.currentTarget as HTMLInputElement
    if (input.files) void addFiles(input.files)
    input.value = ''
  }

  const requestImport = (files: File[] = []) => {
    setPendingImportFiles(files)
    setImportChoiceOpen(true)
  }

  const importSeparately = () => {
    const selectedFiles = pendingImportFiles
    setImportChoiceOpen(false)
    setPendingImportFiles([])
    if (selectedFiles.length > 0) void addFiles(selectedFiles)
    else window.setTimeout(() => fileInput.current?.click(), 0)
  }

  const openMergeFromImport = () => {
    const items = pendingImportFiles.map((file, index) => ({ id: `import-${Date.now()}-${index}`, file }))
    setImportChoiceOpen(false)
    setPendingImportFiles([])
    setMergeSession({ initialItems: items, replacePageIds: [] })
  }

  const openDocumentMerge = () => {
    setMergeSession({
      initialItems: pages.map((page) => ({ id: `page-${page.id}`, file: page.sourceFile, url: page.sourceUrl, pageId: page.id })),
      replacePageIds: pages.map((page) => page.id),
    })
  }

  const confirmSourceMerge = async (result: MergeStudioResult) => {
    if (!mergeSession || result.sources.length < 2) return
    setBusyLabel('正在拼合原图')
    try {
      const merged = await composePlacedScans(result.sources, result.placements, result.aspectRatio, 0.94)
      const sourceName = fileStem(result.sources[0]?.name ?? '拼合扫描')
      const fileName = `${sourceName}-拼合.jpg`
      const sourceFile = new File([merged.blob], fileName, { type: 'image/jpeg' })
      const sourceUrl = URL.createObjectURL(sourceFile)
      const mergedPage: ScanPage = {
        id: idFor(),
        fileName,
        sourceUrl,
        sourceFile,
        corners: cloneCorners(MERGED_CORNERS),
        rotation: 0,
        flipX: false,
        flipY: false,
        filter: 'auto',
        filterStrengths: {},
        adjustments: { ...DEFAULT_ADJUSTMENTS },
        createdAt: Date.now(),
      }
      const replaceIds = new Set(mergeSession.replacePageIds)
      commitDocument((current) => {
        const retained = result.keepOriginals ? current.pages : current.pages.filter((page) => !replaceIds.has(page.id))
        return {
          title: current.pages.length === 0 ? sourceName : current.title,
          pages: [...retained, mergedPage],
          selectedId: mergedPage.id,
        }
      }, `拼合 ${result.sources.length} 张原图`)
      setMergeSession(null)
      setMode('crop')
      setToast(`${result.sources.length} 张原图已拼合，可继续校正与增强`)
      navigator.vibrate?.(12)
    } catch {
      setToast('原图拼合失败，请减少图片数量后重试。')
    } finally {
      setBusyLabel(null)
    }
  }

  const resetCorners = () => updateActive({ corners: cloneCorners(DEFAULT_CORNERS) }, true, '重置扫描范围')
  const resetAdjustments = () => {
    if (!activePage) return
    updateActive({
      adjustments: { ...DEFAULT_ADJUSTMENTS },
      filterStrengths: {
        ...activePage.filterStrengths,
        [activePage.filter]: DEFAULT_FILTER_STRENGTHS[activePage.filter],
      },
    }, true, '还原增强参数')
  }
  const resetPage = () => updateActive({
    corners: cloneCorners(DEFAULT_CORNERS),
    rotation: 0,
    flipX: false,
    flipY: false,
    filter: 'auto',
    filterStrengths: {},
    adjustments: { ...DEFAULT_ADJUSTMENTS },
  }, true, '重置当前页')
  const applyGeometry = (patch: Partial<ScanPage>, message: string) => {
    updateActive(patch, true, message)
    setPreview((current) => {
      if (current) URL.revokeObjectURL(current.url)
      return null
    })
    setMode('filter')
    setToast(message)
    navigator.vibrate?.(7)
  }
  const rotate = () => applyGeometry({ rotation: ((activePage?.rotation ?? 0) + 90) % 360 }, '已向右旋转 90°')
  const rotateLeft = () => applyGeometry({ rotation: ((activePage?.rotation ?? 0) + 270) % 360 }, '已向左旋转 90°')
  const flipHorizontal = () => applyGeometry({ flipX: !(activePage?.flipX ?? false) }, '已切换水平翻转')
  const flipVertical = () => applyGeometry({ flipY: !(activePage?.flipY ?? false) }, '已切换垂直翻转')

  const detectCorners = async () => {
    if (!activePage) return
    setBusyLabel('正在识别边缘')
    try {
      const corners = await detectDocumentCorners(activePage.sourceUrl)
      updateActive({ corners }, true, '自动识别文档边缘')
      setToast('已重新识别四角')
    } finally {
      setBusyLabel(null)
    }
  }

  const deletePageById = (pageId: string) => {
    commitDocument((current) => {
      const index = current.pages.findIndex((page) => page.id === pageId)
      if (index < 0) return current
      const remaining = current.pages.filter((page) => page.id !== pageId)
      const selected = current.selectedId === pageId
        ? remaining[Math.min(index, remaining.length - 1)]?.id ?? null
        : current.selectedId
      return { ...current, pages: remaining, selectedId: selected }
    }, '删除页面')
  }

  const duplicatePage = (pageId: string) => {
    commitDocument((current) => {
      const index = current.pages.findIndex((page) => page.id === pageId)
      if (index < 0) return current
      const source = current.pages[index]
      const duplicate: ScanPage = {
        ...source,
        id: idFor(),
        fileName: `${fileStem(source.fileName)}-副本.jpg`,
        corners: cloneCorners(source.corners),
        filterStrengths: { ...source.filterStrengths },
        adjustments: { ...source.adjustments },
        createdAt: Date.now(),
      }
      const next = [...current.pages]
      next.splice(index + 1, 0, duplicate)
      return { ...current, pages: next, selectedId: duplicate.id }
    }, '复制页面')
    setToast('已复制当前页')
  }

  const reorderPage = (pageId: string, offset: -1 | 1) => {
    commitDocument((current) => {
      const next = movePage(current.pages, pageId, offset)
      return next === current.pages ? current : { ...current, pages: next }
    }, offset < 0 ? '页面前移' : '页面后移')
    navigator.vibrate?.(6)
  }

  const applyCurrentToAll = () => {
    commitDocument((current) => {
      const source = current.pages.find((page) => page.id === current.selectedId)
      if (!source) return current
      return { ...current, pages: current.pages.map((page) => copyPageSettings(source, page)) }
    }, '增强设置套用到全部页')
    setToast('当前增强设置已套用到全部页面')
  }

  const clearDocumentNow = () => {
    if (pages.length > 0 && !window.confirm('清空当前文档及本地自动保存内容？')) return
    const urls = new Set(pages.map((page) => page.sourceUrl))
    urls.forEach((url) => URL.revokeObjectURL(url))
    setPreview((current) => {
      if (current) URL.revokeObjectURL(current.url)
      return null
    })
    const next = emptyDocument()
    documentRef.current = next
    setScanDocument(next)
    setHistory({ past: [], future: [] })
    setActivityLog([{ id: idFor(), label: '新建空白文档', at: Date.now() }])
    setPageManagerOpen(false)
    void clearSession()
    setToast('已新建空白文档')
  }

  const selectPage = (pageId: string) => updateDocument((current) => ({ ...current, selectedId: pageId }))

  const selectRelativePage = (offset: -1 | 1) => {
    const index = pages.findIndex((page) => page.id === selectedId)
    const target = pages[index + offset]
    if (target) selectPage(target.id)
  }

  const updateAdjustment = (key: keyof ScanPage['adjustments'], value: number) => {
    if (!activePage) return
    updateActive({ adjustments: { ...activePage.adjustments, [key]: value } }, false)
  }

  const outputProfile = QUALITY_PROFILES[exportOptions.quality]
  const renderExportPage = (page: ScanPage) => renderScan(
    page.sourceUrl,
    page.corners,
    page.rotation,
    page.filter,
    filterStrengthFor(page),
    outputProfile.maxDimension,
    outputProfile.jpegQuality,
    page.adjustments,
    page.flipX,
    page.flipY,
  )

  const exportJpg = async () => {
    if (!activePage) return
    setBusyLabel('正在生成 JPG')
    try {
      const result = await renderExportPage(activePage)
      const pageNumber = pages.findIndex((page) => page.id === activePage.id) + 1
      await saveBlob(result.blob, `${fileStem(scanDocument.title)}-${String(pageNumber).padStart(2, '0')}.jpg`, '导出扫描 JPG')
      URL.revokeObjectURL(result.url)
      setExportOpen(false)
      setToast('JPG 已准备好')
    } catch {
      setToast('JPG 导出失败。')
    } finally {
      setBusyLabel(null)
    }
  }

  const exportZip = async () => {
    if (pages.length === 0) return
    setBusyLabel(`正在生成 1/${pages.length}`)
    try {
      const entries = []
      for (let index = 0; index < pages.length; index += 1) {
        setBusyLabel(`正在生成 ${index + 1}/${pages.length}`)
        const result = await renderExportPage(pages[index])
        entries.push({
          name: `${fileStem(scanDocument.title)}-${String(index + 1).padStart(2, '0')}.jpg`,
          data: new Uint8Array(await result.blob.arrayBuffer()),
        })
        URL.revokeObjectURL(result.url)
      }
      const zip = createZip(entries)
      await saveBlob(new Blob([zip], { type: 'application/zip' }), `${fileStem(scanDocument.title)}-JPG.zip`, '导出全部扫描图片')
      setExportOpen(false)
      setToast(`${pages.length} 页 JPG 已打包`)
    } catch {
      setToast('JPG 压缩包导出失败。')
    } finally {
      setBusyLabel(null)
    }
  }

  const exportMerged = async () => {
    if (pages.length === 0) return
    const rendered = []
    setBusyLabel(`正在合并 1/${pages.length}`)
    try {
      for (let index = 0; index < pages.length; index += 1) {
        setBusyLabel(`正在合并 ${index + 1}/${pages.length}`)
        rendered.push(await renderExportPage(pages[index]))
      }
      const merged = await composeScans(rendered, exportOptions.mergeLayout, outputProfile.jpegQuality)
      const suffix = exportOptions.mergeLayout === 'vertical' ? '纵向长图' : exportOptions.mergeLayout === 'horizontal' ? '横向拼接' : '双列拼图'
      await saveBlob(merged.blob, `${fileStem(scanDocument.title)}-${suffix}.jpg`, '导出合并扫描图片')
      setExportOpen(false)
      setToast(`${pages.length} 页已合并为 ${merged.width} × ${merged.height}`)
    } catch {
      setToast('图片合并失败，请减少页面后重试。')
    } finally {
      rendered.forEach((result) => URL.revokeObjectURL(result.url))
      setBusyLabel(null)
    }
  }

  const exportPdf = async () => {
    if (pages.length === 0) return
    setBusyLabel(`正在生成 1/${pages.length}`)
    try {
      const jpegPages = []
      for (let index = 0; index < pages.length; index += 1) {
        setBusyLabel(`正在生成 ${index + 1}/${pages.length}`)
        const result = await renderExportPage(pages[index])
        jpegPages.push({ bytes: new Uint8Array(await result.blob.arrayBuffer()), width: result.width, height: result.height })
        URL.revokeObjectURL(result.url)
      }
      const pdf = createPdf(jpegPages, { pageSize: exportOptions.pageSize, margin: exportOptions.margin ? 24 : 0 })
      await saveBlob(new Blob([pdf], { type: 'application/pdf' }), `${fileStem(scanDocument.title)}.pdf`, '导出扫描 PDF')
      setExportOpen(false)
      setToast(`${pages.length} 页 PDF 已准备好`)
    } catch {
      setToast('PDF 导出失败。')
    } finally {
      setBusyLabel(null)
    }
  }

  const onDrop = (event: DragEvent) => {
    event.preventDefault()
    if (event.dataTransfer?.files) requestImport(Array.from(event.dataTransfer.files))
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return
      const command = event.ctrlKey || event.metaKey
      if (command && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (event.shiftKey) redo()
        else undo()
      } else if (command && event.key.toLowerCase() === 'y') {
        event.preventDefault()
        redo()
      } else if (command && event.key.toLowerCase() === 'e' && pages.length > 0) {
        event.preventDefault()
        setExportOpen(true)
      } else if (event.key === 'Delete' && activePage) {
        deletePageById(activePage.id)
      } else if (event.key.toLowerCase() === 'r' && activePage) {
        rotate()
      } else if (event.key === 'PageUp') {
        selectRelativePage(-1)
      } else if (event.key === 'PageDown') {
        selectRelativePage(1)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [activePage, pages, selectedId, undo, redo])

  const selectedFilter = FILTERS.find((filter) => filter.id === activePage?.filter) ?? FILTERS[0]
  const activeStrength = activePage ? filterStrengthFor(activePage) : 0
  const saveLabel = saveState === 'saving' ? '正在自动保存' : saveState === 'error' ? '自动保存失败' : '已自动保存到本机'
  const jumpToFilterCategory = (category: FilterCategoryId) => {
    setFilterCategory(category)
    const first = FILTERS.find((filter) => filter.category === category)
    if (first) filterButtons.current[first.id]?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' })
  }

  return (
    <div class="app-shell" onDragOver={(event) => event.preventDefault()} onDrop={onDrop}>
      <aside class="sidebar">
        <div class="brand-lockup"><div class="brand-mark"><img src="./brand/scanyao-icon.png" alt="" /></div><div><strong>扫耀</strong><span>ScanYao</span></div></div>
        <nav class="side-nav" aria-label="主导航">
          <button class="nav-item active" type="button"><Grid2X2 size={17} /><span>扫描工作台</span><small>{pages.length}</small></button>
          <button class="nav-item" type="button" onClick={() => setPageManagerOpen(true)} disabled={pages.length === 0}><Layers3 size={17} /><span>页面管理</span><small>{pages.length || '—'}</small></button>
          <button class="nav-item" type="button" onClick={() => setExportOpen(true)} disabled={pages.length === 0}><Archive size={17} /><span>导出文档</span><small>{pages.length ? 'PDF' : '—'}</small></button>
        </nav>
        <div class="sidebar-spacer" />
        <div class="local-note"><span class="status-dot" />本地处理<br /><small>{saveLabel}</small></div>
        <button class="theme-toggle" type="button" onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')} aria-label="切换深浅色主题" title="切换深浅色主题">{theme === 'light' ? <Moon size={17} /> : <Sun size={17} />}<span>{theme === 'light' ? '深色外观' : '浅色外观'}</span></button>
        <div class="sidebar-footer">v0.2 · 本地优先</div>
      </aside>

      <main class="main-content">
        <header class="topbar">
          <div class="page-heading">
            <p>扫描工作台</p>
            <input class="document-title" aria-label="文档名称" value={scanDocument.title} onFocus={beginTransaction} onBlur={endTransaction} onInput={(event) => updateDocument((current) => ({ ...current, title: (event.currentTarget as HTMLInputElement).value }))} />
          </div>
          <div class="top-actions">
            <div class="history-actions"><button class="icon-button" type="button" onClick={undo} disabled={history.past.length === 0} aria-label="撤销" title="撤销"><Undo2 size={17} /></button><button class="icon-button" type="button" onClick={redo} disabled={history.future.length === 0} aria-label="重做" title="重做"><Redo2 size={17} /></button></div>
            <button class="quiet-button import-button" type="button" onClick={() => requestImport()}><Upload size={16} />导入图片</button>
            <button class="primary-button capture-button" type="button" onClick={() => cameraInput.current?.click()}><Aperture size={17} />拍摄</button>
            <button class="icon-button history-entry" type="button" onClick={() => setHistoryOpen(true)} disabled={pages.length === 0 && activityLog.length === 0} aria-label="操作历史、撤销与重做" title="操作历史、撤销与重做"><History size={18} /></button>
            {pages.length > 0 && <div class="merge-quick-actions"><button class="icon-button" type="button" onClick={openDocumentMerge} aria-label="处理前原图拼合" title="处理前原图拼合"><Images size={18} /></button><button class="icon-button" type="button" onClick={() => setExportOpen(true)} aria-label="处理后合并与导出" title="处理后合并与导出"><Combine size={18} /></button></div>}
          </div>
        </header>

        {!activePage ? (
          <section class="empty-state" aria-label="开始扫描">
            <div class="empty-icon"><ScanLine size={34} strokeWidth={1.7} /></div>
            <p class="eyebrow">LOCAL-FIRST SCANNER</p>
            <h2>把纸张，变成清晰的数字文件。</h2>
            <p class="empty-copy">导入照片或直接拍摄。四角校正、文档增强、自动保存与多格式导出都在本机完成。</p>
            <div class="empty-actions"><button class="primary-button large" type="button" onClick={() => cameraInput.current?.click()}><Aperture size={18} />拍一张</button><button class="quiet-button large" type="button" onClick={() => requestImport()}><ImagePlus size={18} />从相册导入</button></div>
            <div class="drop-hint"><FilePlus2 size={15} />也可以把图片拖到这里</div>
          </section>
        ) : (
          <section class="workspace" style={`--mobile-preview-ratio: ${previewRatio}%`}>
            <div class="editor-column">
              <div class="canvas-panel">
                <div class="canvas-toolbar">
                  <div class="segmented-control" role="tablist" aria-label="编辑模式"><button type="button" class={mode === 'crop' ? 'segment active' : 'segment'} onClick={() => setMode('crop')}><ScanLine size={15} />校正</button><button type="button" class={mode === 'filter' ? 'segment active' : 'segment'} onClick={() => setMode('filter')}><Sparkles size={15} />增强</button></div>
                  <div class="canvas-toolbar-actions"><span class="canvas-meta">第 {pages.findIndex((page) => page.id === selectedId) + 1} / {pages.length} 页</span><div class="mobile-history-actions"><button class="icon-button subtle" type="button" onClick={undo} disabled={history.past.length === 0} aria-label="撤销" title="撤销"><Undo2 size={17} /></button><button class="icon-button subtle" type="button" onClick={redo} disabled={history.future.length === 0} aria-label="重做" title="重做"><Redo2 size={17} /></button></div><button class="icon-button subtle rotate-shortcut" type="button" onClick={rotate} aria-label="旋转 90 度" title="旋转 90 度"><RotateCw size={17} /></button><button class="icon-button subtle" type="button" onClick={resetPage} aria-label="重置当前页" title="重置当前页"><RotateCcw size={17} /></button><button class="icon-button subtle mobile-history-entry" type="button" onClick={() => setHistoryOpen(true)} aria-label="查看操作历史" title="查看操作历史"><History size={17} /></button><button class="icon-button subtle danger-icon" type="button" onClick={() => deletePageById(activePage.id)} aria-label="删除当前页" title="删除当前页"><Trash2 size={17} /></button></div>
                </div>
                <div class="canvas-stage">
                  {mode === 'crop' ? <CropCanvas imageUrl={activePage.sourceUrl} corners={activePage.corners} onChange={(corners) => updateActive({ corners }, false)} onEditStart={beginTransaction} onEditEnd={endTransaction} /> : preview ? <img class="processed-preview" src={preview.url} alt="扫描预览" /> : <div class="processing-state"><Sparkles size={20} />正在生成预览…</div>}
                  {busy && <div class="busy-overlay"><span class="spinner" />{busyLabel}</div>}
                </div>
                <div class="canvas-footer"><span><Check size={14} />{saveLabel}</span><span>{preview ? `${preview.width} × ${preview.height}` : '预览等待中'}</span></div>
              </div>

              <div class="page-strip" aria-label="扫描页列表"><div class="page-strip-label"><span>页码</span><strong>{pages.length.toString().padStart(2, '0')}</strong></div><div class="thumb-list">{pages.map((page, index) => <button type="button" class={page.id === selectedId ? 'thumb active' : 'thumb'} onClick={() => selectPage(page.id)} key={page.id} aria-label={`第 ${index + 1} 页`}><img src={page.sourceUrl} alt="" /><span>{index + 1}</span></button>)}<button type="button" class="add-thumb" onClick={() => requestImport()} aria-label="添加页面" title="添加页面"><FilePlus2 size={18} /></button></div><button class="strip-more" type="button" onClick={() => setPageManagerOpen(true)} aria-label="页面管理" title="页面管理"><MoreHorizontal size={18} /></button></div>
            </div>

            <aside class="inspector">
              <div class="inspector-header"><div><p>当前页面</p><h2>{mode === 'crop' ? '校正文档边缘' : '增强扫描效果'}</h2></div><div class="preview-ratio-control" title="调整上方预览占比"><Settings2 size={15} /><input type="range" min={44} max={68} step={1} value={previewRatio} aria-label="上方预览比例" onInput={(event) => setPreviewRatio(Number((event.currentTarget as HTMLInputElement).value))} /><output>{previewRatio}%</output></div><Settings2 class="inspector-settings" size={18} /></div>
              <div class="inspector-scroll">
                <section class="control-section"><div class="section-heading"><span>扫描范围</span><button type="button" class="text-button" onClick={resetCorners}>重置</button></div><button type="button" class="auto-detect" onClick={() => void detectCorners()}><WandSparkles size={16} /><span><strong>自动识别边缘</strong><small>拖动四个蓝点可继续微调</small></span><ChevronDown size={15} /></button></section>
                <section class="control-section"><div class="section-heading"><span>几何处理</span><span class="muted-value">{activePage.rotation}°</span></div><div class="transform-grid"><button type="button" onClick={rotateLeft}><RotateCcw size={16} /><span>左转</span></button><button type="button" onClick={rotate}><RotateCw size={16} /><span>右转</span></button><button type="button" class={activePage.flipX ? 'active' : ''} onClick={flipHorizontal}><FlipHorizontal2 size={16} /><span>水平翻转</span></button><button type="button" class={activePage.flipY ? 'active' : ''} onClick={flipVertical}><FlipVertical2 size={16} /><span>垂直翻转</span></button></div></section>
                <section class="control-section">
                  <div class="section-heading"><span>滤镜</span><span class="muted-value">{selectedFilter.label}</span></div>
                  <div class="filter-category-tabs" role="tablist" aria-label="滤镜场景分类">{FILTER_CATEGORIES.map((category) => <button type="button" role="tab" aria-selected={filterCategory === category.id} class={filterCategory === category.id ? 'active' : ''} onClick={() => jumpToFilterCategory(category.id)} key={category.id}>{category.label}</button>)}</div>
                  <div ref={filterStrip} class="filter-strip">{FILTERS.map((filter) => { const Icon = filter.icon; return <button ref={(node) => { filterButtons.current[filter.id] = node ?? undefined }} key={filter.id} type="button" class={activePage.filter === filter.id ? `filter-option active filter-${filter.id}` : `filter-option filter-${filter.id}`} onClick={() => { setFilterCategory(filter.category); updateActive({ filter: filter.id }, true, `切换滤镜：${filter.label}`); setMode('filter') }} title={filter.hint}><Icon size={18} /><span>{filter.label}</span></button> })}</div>
                  <RangeControl id="filter-strength" label={`${selectedFilter.label}强度`} value={Math.round(activeStrength * 100)} min={0} max={100} output={`${Math.round(activeStrength * 100)}%`} onBegin={beginTransaction} onEnd={endTransaction} onInput={(value) => { updateActive({ filterStrengths: { ...activePage.filterStrengths, [activePage.filter]: value / 100 } }, false); setMode('filter') }} />
                </section>
                <section class="control-section adjustment-section">
                  <div class="section-heading"><span>精细调节</span><button type="button" class="text-button" onClick={resetAdjustments}>还原</button></div>
                  <RangeControl id="brightness" label="亮度" value={Math.round(activePage.adjustments.brightness * 100)} min={-100} max={100} output={`${Math.round(activePage.adjustments.brightness * 100)}`} onBegin={beginTransaction} onEnd={endTransaction} onInput={(value) => { updateAdjustment('brightness', value / 100); setMode('filter') }} />
                  <RangeControl id="contrast" label="对比度" value={Math.round(activePage.adjustments.contrast * 100)} min={-100} max={100} output={`${Math.round(activePage.adjustments.contrast * 100)}`} onBegin={beginTransaction} onEnd={endTransaction} onInput={(value) => { updateAdjustment('contrast', value / 100); setMode('filter') }} />
                  <RangeControl id="sharpen" label="锐化" value={Math.round(activePage.adjustments.sharpen * 100)} min={0} max={100} output={`${Math.round(activePage.adjustments.sharpen * 100)}%`} onBegin={beginTransaction} onEnd={endTransaction} onInput={(value) => { updateAdjustment('sharpen', value / 100); setMode('filter') }} />
                  {activePage.filter === 'bw' && <RangeControl id="threshold" label="黑白阈值" value={Math.round(activePage.adjustments.threshold * 100)} min={0} max={100} output={`${Math.round(activePage.adjustments.threshold * 100)}%`} onBegin={beginTransaction} onEnd={endTransaction} onInput={(value) => updateAdjustment('threshold', value / 100)} />}
                </section>
                <section class="control-section"><div class="section-heading"><span>批量与输出</span><span class="muted-value">{pages.length} 页</span></div><div class="output-actions"><button type="button" class="output-button" onClick={applyCurrentToAll} disabled={pages.length < 2}><Copy size={17} /><span>增强设置套用到全部页</span></button><button type="button" class="output-button" onClick={() => void exportJpg()}><FileImage size={17} /><span>当前页 JPG</span><Download size={15} /></button><button type="button" class="output-button primary" onClick={() => void exportPdf()}><FileText size={17} /><span>全部导出 PDF</span><Download size={15} /></button></div></section>
              </div>
            </aside>
          </section>
        )}
      </main>

      <nav class="mobile-nav" aria-label="移动端导航"><button type="button" onClick={() => setPageManagerOpen(true)} disabled={pages.length === 0}><Layers3 size={18} /><span>页面</span></button><button type="button" onClick={() => setHistoryOpen(true)} disabled={pages.length === 0 && activityLog.length === 0}><History size={18} /><span>历史</span></button><button type="button" onClick={() => cameraInput.current?.click()} class="mobile-capture"><Aperture size={19} /><span>拍摄</span></button><button type="button" onClick={() => requestImport()}><ImagePlus size={18} /><span>导入</span></button><button type="button" onClick={() => setExportOpen(true)} disabled={pages.length === 0}><Download size={18} /><span>导出</span></button><button type="button" onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>{theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}<span>外观</span></button></nav>
      <input ref={fileInput} type="file" accept="image/*" multiple hidden onChange={onInputChange} />
      <input ref={cameraInput} type="file" accept="image/*" capture="environment" hidden onChange={onInputChange} />
      {importChoiceOpen && <ImportChoiceSheet selectedCount={pendingImportFiles.length} onSeparate={importSeparately} onMerge={openMergeFromImport} onClose={() => { setImportChoiceOpen(false); setPendingImportFiles([]) }} />}
      {mergeSession && <SourceMergeSheet initialItems={mergeSession.initialItems} replacePageCount={mergeSession.replacePageIds.length} busy={busy} onClose={() => setMergeSession(null)} onConfirm={(result) => void confirmSourceMerge(result)} />}
      {historyOpen && <HistorySheet records={activityLog} canUndo={history.past.length > 0} canRedo={history.future.length > 0} canReset={activePage !== null} onUndo={undo} onRedo={redo} onReset={() => { resetPage(); setHistoryOpen(false); setToast('当前页已重置') }} onClose={() => setHistoryOpen(false)} />}
      {exportOpen && <ExportSheet documentName={scanDocument.title} options={exportOptions} pageCount={pages.length} currentIndex={pages.findIndex((page) => page.id === selectedId)} busy={busy} onNameChange={(title) => updateDocument((current) => ({ ...current, title }))} onOptionsChange={(patch) => setExportOptions((current) => ({ ...current, ...patch }))} onClose={() => setExportOpen(false)} onPdf={() => void exportPdf()} onJpg={() => void exportJpg()} onZip={() => void exportZip()} onMerge={() => void exportMerged()} />}
      {pageManagerOpen && <PageManager pages={pages} selectedId={selectedId} onClose={() => setPageManagerOpen(false)} onSelect={(id) => { selectPage(id); setPageManagerOpen(false) }} onMove={reorderPage} onDuplicate={duplicatePage} onDelete={deletePageById} onApplyAll={applyCurrentToAll} onClear={clearDocumentNow} />}
      {toast && <div class="toast" role="status"><Check size={16} />{toast}</div>}
    </div>
  )
}
