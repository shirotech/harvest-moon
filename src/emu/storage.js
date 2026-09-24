// Local persistence for cartridge mode (IndexedDB). Everything stays in the
// player's browser: their cartridge dumps, battery saves and save states.

const DB_NAME = 'moonlit-cartridges';
const STORES = ['roms', 'saves', 'states'];
let dbPromise = null;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB unavailable'));
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      for (const s of STORES) if (!req.result.objectStoreNames.contains(s)) req.result.createObjectStore(s);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function tx(store, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const req = fn(t.objectStore(store));
    t.oncomplete = () => resolve(req?.result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export const storage = {
  put: (store, key, value) => tx(store, 'readwrite', (s) => s.put(value, key)).catch((e) => console.warn('storage.put', e)),
  get: (store, key) => tx(store, 'readonly', (s) => s.get(key)).catch(() => undefined),
  del: (store, key) => tx(store, 'readwrite', (s) => s.delete(key)).catch(() => undefined),
  async all(store) {
    try {
      const db = await open();
      return await new Promise((resolve, reject) => {
        const out = [];
        const t = db.transaction(store, 'readonly');
        const req = t.objectStore(store).openCursor();
        req.onsuccess = () => {
          const c = req.result;
          if (c) {
            out.push({ key: c.key, value: c.value });
            c.continue();
          } else resolve(out);
        };
        req.onerror = () => reject(req.error);
      });
    } catch {
      return [];
    }
  },
};
