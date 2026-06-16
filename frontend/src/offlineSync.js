const DB_NAME = 'mazr3a-offline-db'
const DB_VERSION = 1
const QUEUE_STORE = 'requestQueue'
const CACHE_STORE = 'cacheStore'

const memoryQueue = []
const memoryCache = new Map()
let indexedDbStatus = 'unknown'

async function isIndexedDbAvailable() {
  if (indexedDbStatus === 'available') return true
  if (indexedDbStatus === 'unavailable') return false
  if (typeof window === 'undefined' || typeof indexedDB === 'undefined') {
    indexedDbStatus = 'unavailable'
    return false
  }
  try {
    await new Promise((resolve, reject) => {
      const probe = indexedDB.open(`${DB_NAME}-probe`, 1)
      probe.onsuccess = () => {
        probe.result.close()
        resolve()
      }
      probe.onerror = () => reject(probe.error || new Error('indexedDB unavailable'))
      probe.onblocked = () => reject(new Error('indexedDB blocked'))
    })
    indexedDbStatus = 'available'
    return true
  } catch {
    indexedDbStatus = 'unavailable'
    return false
  }
}

function openDb() {
  return new Promise((resolve, reject) => {
    let request
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION)
    } catch (err) {
      reject(err)
      return
    }
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(QUEUE_STORE)) {
        db.createObjectStore(QUEUE_STORE, { keyPath: 'id', autoIncrement: true })
      }
      if (!db.objectStoreNames.contains(CACHE_STORE)) {
        db.createObjectStore(CACHE_STORE, { keyPath: 'key' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function txComplete(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

export async function enqueueRequest(path, options = {}) {
  if (!(await isIndexedDbAvailable())) {
    memoryQueue.push({
      id: Date.now() + Math.random(),
      path,
      method: options.method || 'GET',
      headers: options.headers || {},
      body: options.body || null,
      createdAt: new Date().toISOString(),
    })
    return
  }
  const db = await openDb()
  const tx = db.transaction(QUEUE_STORE, 'readwrite')
  const store = tx.objectStore(QUEUE_STORE)
  store.add({
    path,
    method: options.method || 'GET',
    headers: options.headers || {},
    body: options.body || null,
    createdAt: new Date().toISOString(),
  })
  await txComplete(tx)
}

export async function syncQueuedRequests(apiBaseUrl) {
  if (!(await isIndexedDbAvailable())) {
    const queued = [...memoryQueue].sort((a, b) => Number(a.id) - Number(b.id))
    for (const item of queued) {
      try {
        const response = await fetch(`${apiBaseUrl}${item.path}`, {
          method: item.method,
          headers: item.headers,
          body: item.body,
        })
        if (!response.ok) continue
        const idx = memoryQueue.findIndex((queuedItem) => queuedItem.id === item.id)
        if (idx !== -1) memoryQueue.splice(idx, 1)
      } catch {
        break
      }
    }
    return
  }

  const db = await openDb()
  const readTx = db.transaction(QUEUE_STORE, 'readonly')
  const readStore = readTx.objectStore(QUEUE_STORE)
  const queued = await new Promise((resolve, reject) => {
    const req = readStore.getAll()
    req.onsuccess = () => resolve(req.result || [])
    req.onerror = () => reject(req.error)
  })
  await txComplete(readTx)

  const sorted = queued.sort((a, b) => a.id - b.id)
  for (const item of sorted) {
    try {
      const response = await fetch(`${apiBaseUrl}${item.path}`, {
        method: item.method,
        headers: item.headers,
        body: item.body,
      })
      if (!response.ok) continue

      const deleteTx = db.transaction(QUEUE_STORE, 'readwrite')
      deleteTx.objectStore(QUEUE_STORE).delete(item.id)
      await txComplete(deleteTx)
    } catch {
      break
    }
  }
}

export async function cacheData(key, data) {
  if (!(await isIndexedDbAvailable())) {
    memoryCache.set(key, data)
    return
  }
  const db = await openDb()
  const tx = db.transaction(CACHE_STORE, 'readwrite')
  tx.objectStore(CACHE_STORE).put({ key, data, updatedAt: new Date().toISOString() })
  await txComplete(tx)
}

export async function getCachedData(key) {
  if (!(await isIndexedDbAvailable())) {
    return memoryCache.get(key) ?? null
  }
  const db = await openDb()
  const tx = db.transaction(CACHE_STORE, 'readonly')
  const store = tx.objectStore(CACHE_STORE)
  const data = await new Promise((resolve, reject) => {
    const req = store.get(key)
    req.onsuccess = () => resolve(req.result?.data ?? null)
    req.onerror = () => reject(req.error)
  })
  await txComplete(tx)
  return data
}
