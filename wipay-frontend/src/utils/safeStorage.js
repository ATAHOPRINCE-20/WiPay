// Safe Web Storage helper for restricted WebViews (e.g. Android CaptivePortalLogin)
// where window.localStorage or window.sessionStorage may be null or throw SecurityError.

const memoryStorage = new Map()

function getNativeStorage(type) {
  try {
    if (typeof window !== 'undefined' && window[type]) {
      const storage = window[type]
      const testKey = '__wipay_storage_test__'
      storage.setItem(testKey, testKey)
      storage.removeItem(testKey)
      return storage
    }
  } catch (_) {}
  return null
}

export const safeLocalStorage = {
  getItem(key) {
    const storage = getNativeStorage('localStorage')
    if (storage) {
      try {
        return storage.getItem(key)
      } catch (_) {}
    }
    return memoryStorage.has(`local_${key}`) ? memoryStorage.get(`local_${key}`) : null
  },
  setItem(key, value) {
    const storage = getNativeStorage('localStorage')
    if (storage) {
      try {
        storage.setItem(key, String(value))
        return
      } catch (_) {}
    }
    memoryStorage.set(`local_${key}`, String(value))
  },
  removeItem(key) {
    const storage = getNativeStorage('localStorage')
    if (storage) {
      try {
        storage.removeItem(key)
        return
      } catch (_) {}
    }
    memoryStorage.delete(`local_${key}`)
  },
  clear() {
    const storage = getNativeStorage('localStorage')
    if (storage) {
      try {
        storage.clear()
      } catch (_) {}
    }
    for (const key of memoryStorage.keys()) {
      if (key.startsWith('local_')) {
        memoryStorage.delete(key)
      }
    }
  }
}

export const safeSessionStorage = {
  getItem(key) {
    const storage = getNativeStorage('sessionStorage')
    if (storage) {
      try {
        return storage.getItem(key)
      } catch (_) {}
    }
    return memoryStorage.has(`session_${key}`) ? memoryStorage.get(`session_${key}`) : null
  },
  setItem(key, value) {
    const storage = getNativeStorage('sessionStorage')
    if (storage) {
      try {
        storage.setItem(key, String(value))
        return
      } catch (_) {}
    }
    memoryStorage.set(`session_${key}`, String(value))
  },
  removeItem(key) {
    const storage = getNativeStorage('sessionStorage')
    if (storage) {
      try {
        storage.removeItem(key)
        return
      } catch (_) {}
    }
    memoryStorage.delete(`session_${key}`)
  },
  clear() {
    const storage = getNativeStorage('sessionStorage')
    if (storage) {
      try {
        storage.clear()
      } catch (_) {}
    }
    for (const key of memoryStorage.keys()) {
      if (key.startsWith('session_')) {
        memoryStorage.delete(key)
      }
    }
  }
}
