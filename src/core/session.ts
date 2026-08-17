import { DEFAULT_ADJUSTMENTS } from './imageEngine'
import type { ScanDocument, ScanPage } from '../types'

const DATABASE_NAME = 'scanyao-local'
const STORE_NAME = 'sessions'
const ACTIVE_KEY = 'active-document'

interface PersistedPage extends Omit<ScanPage, 'sourceUrl' | 'sourceFile'> {
  sourceFile: Blob
}

interface PersistedSession {
  key: string
  version: 2
  title: string
  selectedId: string | null
  pages: PersistedPage[]
}

function openDatabase() {
  if (!('indexedDB' in globalThis)) return Promise.resolve<IDBDatabase | null>(null)
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: 'key' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function transactionRequest<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>) {
  return openDatabase().then((database) => {
    if (!database) return null
    return new Promise<T | null>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, mode)
      const request = action(transaction.objectStore(STORE_NAME))
      request.onsuccess = () => resolve(request.result ?? null)
      request.onerror = () => reject(request.error)
      transaction.oncomplete = () => database.close()
      transaction.onerror = () => reject(transaction.error)
    })
  })
}

export async function loadSession(): Promise<ScanDocument | null> {
  const stored = await transactionRequest<PersistedSession | undefined>('readonly', (store) => store.get(ACTIVE_KEY))
  if (!stored || !Array.isArray(stored.pages) || stored.pages.length === 0) return null

  const pages = stored.pages.map((page) => {
    const legacy = page as PersistedPage & { strength?: number }
    const sourceFile = page.sourceFile instanceof File
      ? page.sourceFile
      : new File([page.sourceFile], page.fileName, { type: page.sourceFile.type || 'image/jpeg' })
    return {
      ...page,
      sourceFile,
      sourceUrl: URL.createObjectURL(sourceFile),
      flipX: page.flipX ?? false,
      flipY: page.flipY ?? false,
      filterStrengths: {
        ...(page.filterStrengths ?? {}),
        [page.filter]: page.filterStrengths?.[page.filter] ?? legacy.strength ?? 0.86,
      },
      adjustments: { ...DEFAULT_ADJUSTMENTS, ...(page.adjustments ?? {}) },
    }
  })
  const selectedId = pages.some((page) => page.id === stored.selectedId) ? stored.selectedId : pages[0].id
  return { title: stored.title || '未命名扫描', selectedId, pages }
}

export async function saveSession(document: ScanDocument) {
  const pages = document.pages.map(({ sourceUrl: _sourceUrl, ...page }) => page)
  const stored: PersistedSession = {
    key: ACTIVE_KEY,
    version: 2,
    title: document.title,
    selectedId: document.selectedId,
    pages,
  }
  await transactionRequest('readwrite', (store) => store.put(stored))
}

export async function clearSession() {
  await transactionRequest('readwrite', (store) => store.delete(ACTIVE_KEY))
}
