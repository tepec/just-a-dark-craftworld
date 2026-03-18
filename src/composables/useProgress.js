import { ref, watch } from 'vue'

const STORAGE_PREFIX = 'bl-progress-'

function getStorageKey(bookId) {
  return `${STORAGE_PREFIX}${bookId}`
}

export function useProgress(bookId) {
  const progress = ref(loadProgress(bookId))

  function loadProgress(id) {
    try {
      const raw = localStorage.getItem(getStorageKey(id))
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  }

  function saveLocation(location, percentage) {
    const data = {
      bookId,
      location,
      percentage: Math.round(percentage * 100) / 100,
      finished: false,
      lastRead: Date.now(),
    }
    localStorage.setItem(getStorageKey(bookId), JSON.stringify(data))
    progress.value = data
  }

  function markFinished() {
    const data = {
      ...(progress.value || { bookId, location: null, percentage: 100 }),
      finished: true,
      lastRead: Date.now(),
    }
    localStorage.setItem(getStorageKey(bookId), JSON.stringify(data))
    progress.value = data
  }

  function deleteProgress() {
    localStorage.removeItem(getStorageKey(bookId))
    progress.value = null
  }

  return { progress, saveLocation, markFinished, deleteProgress }
}

// Utility: get all progress entries (for the library view)
export function getAllProgress() {
  const entries = {}
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key.startsWith(STORAGE_PREFIX)) {
      try {
        entries[key.replace(STORAGE_PREFIX, '')] = JSON.parse(localStorage.getItem(key))
      } catch { /* ignore */ }
    }
  }
  return entries
}
