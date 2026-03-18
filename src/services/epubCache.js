const DB_NAME = 'bl-epub-cache'
const STORE_NAME = 'epubs'
const DB_VERSION = 1
const MAX_CACHE_BYTES = 50 * 1024 * 1024 // 50 Mo

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'productId' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function txStore(db, mode) {
  return db.transaction(STORE_NAME, mode).objectStore(STORE_NAME)
}

function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function getCachedEpub(productId) {
  try {
    const db = await openDB()
    const entry = await reqToPromise(txStore(db, 'readonly').get(productId))
    if (!entry) return null

    // Update lastAccessed
    const store = txStore(db, 'readwrite')
    entry.lastAccessed = Date.now()
    store.put(entry)

    return new Blob([entry.data], { type: 'application/epub+zip' })
  } catch {
    return null
  }
}

export async function cacheEpub(productId, blob) {
  try {
    const db = await openDB()
    const data = await blob.arrayBuffer()
    const size = data.byteLength

    // Evict oldest entries until we have room
    await evict(db, size)

    const store = txStore(db, 'readwrite')
    await reqToPromise(store.put({
      productId,
      data,
      size,
      lastAccessed: Date.now(),
    }))
  } catch {
    // Cache failure is not critical
  }
}

async function evict(db, incomingSize) {
  const store = txStore(db, 'readonly')
  const entries = await reqToPromise(store.getAll())

  let totalSize = entries.reduce((sum, e) => sum + (e.size || 0), 0)
  const target = MAX_CACHE_BYTES - incomingSize

  if (totalSize <= target) return

  // Sort by lastAccessed ascending (oldest first)
  entries.sort((a, b) => (a.lastAccessed || 0) - (b.lastAccessed || 0))

  const toDelete = []
  for (const entry of entries) {
    if (totalSize <= target) break
    toDelete.push(entry.productId)
    totalSize -= entry.size || 0
  }

  if (toDelete.length > 0) {
    const writeStore = txStore(db, 'readwrite')
    for (const id of toDelete) {
      writeStore.delete(id)
    }
  }
}
