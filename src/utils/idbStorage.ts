import { Project, AppSettings } from '../types';
import { DEFAULT_PROJECTS } from './projectStorage';
import { DEFAULT_APP_SETTINGS } from './settingsStorage';

const DB_NAME = 'subtranslate_idb';
const DB_VERSION = 1;

const STORE_PROJECTS = 'projects';
const STORE_SETTINGS = 'settings';
const STORE_MEDIA = 'media_files';

const PROJECTS_LS_KEY = 'subtranslate_capcut_projects_v1';
const SETTINGS_LS_KEY = 'subtranslate_app_settings_v1';

let dbPromise: Promise<IDBDatabase> | null = null;

export function openDatabase(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB is not supported in this environment.'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(STORE_PROJECTS)) {
        db.createObjectStore(STORE_PROJECTS, { keyPath: 'id' });
      }

      if (!db.objectStoreNames.contains(STORE_SETTINGS)) {
        db.createObjectStore(STORE_SETTINGS, { keyPath: 'key' });
      }

      if (!db.objectStoreNames.contains(STORE_MEDIA)) {
        db.createObjectStore(STORE_MEDIA, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      console.error('Failed to open IndexedDB:', request.error);
      reject(request.error);
    };
  });

  return dbPromise;
}

/**
 * Initialize DB and migrate legacy data from localStorage if needed.
 */
export async function initStorageDB(): Promise<{ projects: Project[]; settings: AppSettings }> {
  try {
    const db = await openDatabase();

    // 1. Check & load Projects from IDB
    let projects = await getAllProjectsFromDB(db);

    // If IDB has no projects, try migrating from localStorage or load default
    if (!projects || projects.length === 0) {
      let lsProjects: Project[] | null = null;
      try {
        const raw = localStorage.getItem(PROJECTS_LS_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 0) {
            lsProjects = parsed;
          }
        }
      } catch (e) {
        console.warn('Error reading projects from localStorage during migration:', e);
      }

      const initialProjects = lsProjects || DEFAULT_PROJECTS;
      for (const p of initialProjects) {
        await saveProjectToDB(p, db);
      }
      projects = initialProjects;
    }

    // 2. Check & load Settings from IDB
    let settings = await getSettingsFromDB(db);
    if (!settings) {
      let lsSettings: AppSettings | null = null;
      try {
        const raw = localStorage.getItem(SETTINGS_LS_KEY);
        if (raw) {
          lsSettings = JSON.parse(raw);
        }
      } catch (e) {
        console.warn('Error reading settings from localStorage during migration:', e);
      }
      const initialSettings = { ...DEFAULT_APP_SETTINGS, ...(lsSettings || {}) };
      await saveSettingsToDB(initialSettings, db);
      settings = initialSettings;
    }

    // Sync back to localStorage for fallback
    try {
      localStorage.setItem(PROJECTS_LS_KEY, JSON.stringify(projects));
      localStorage.setItem(SETTINGS_LS_KEY, JSON.stringify(settings));
    } catch (_) {}

    return { projects, settings };
  } catch (err) {
    console.error('initStorageDB error, falling back to defaults:', err);
    return { projects: DEFAULT_PROJECTS, settings: DEFAULT_APP_SETTINGS };
  }
}

/**
 * Get all projects from IDB
 */
export async function getAllProjectsFromDB(existingDb?: IDBDatabase): Promise<Project[]> {
  try {
    const db = existingDb || (await openDatabase());
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_PROJECTS, 'readonly');
      const store = tx.objectStore(STORE_PROJECTS);
      const req = store.getAll();

      req.onsuccess = () => {
        const rawRes = (req.result as Project[]) || [];
        const res = rawRes.filter((p) => p && !p.id.startsWith('proj-sample-'));
        // Sort by updatedAt descending
        res.sort((a, b) => b.updatedAt - a.updatedAt);
        resolve(res);
      };
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.error('getAllProjectsFromDB error:', e);
    return [];
  }
}

/**
 * Save single project to IDB
 */
export async function saveProjectToDB(project: Project, existingDb?: IDBDatabase): Promise<void> {
  try {
    const db = existingDb || (await openDatabase());
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_PROJECTS, 'readwrite');
      const store = tx.objectStore(STORE_PROJECTS);
      const req = store.put(project);

      req.onsuccess = () => {
        // Also update localStorage as fast sync backup
        try {
          getAllProjectsFromDB(db).then((all) => {
            localStorage.setItem(PROJECTS_LS_KEY, JSON.stringify(all));
          });
        } catch (_) {}
        resolve();
      };
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.error('saveProjectToDB error:', e);
  }
}

/**
 * Delete project from IDB
 */
export async function deleteProjectFromDB(id: string, existingDb?: IDBDatabase): Promise<Project[]> {
  try {
    const db = existingDb || (await openDatabase());
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_PROJECTS, 'readwrite');
      const store = tx.objectStore(STORE_PROJECTS);
      const req = store.delete(id);

      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });

    const updated = await getAllProjectsFromDB(db);
    try {
      localStorage.setItem(PROJECTS_LS_KEY, JSON.stringify(updated));
    } catch (_) {}
    return updated;
  } catch (e) {
    console.error('deleteProjectFromDB error:', e);
    return [];
  }
}

/**
 * Get App Settings from IDB
 */
export async function getSettingsFromDB(existingDb?: IDBDatabase): Promise<AppSettings | null> {
  try {
    const db = existingDb || (await openDatabase());
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_SETTINGS, 'readonly');
      const store = tx.objectStore(STORE_SETTINGS);
      const req = store.get('app_settings');

      req.onsuccess = () => {
        if (req.result && req.result.value) {
          resolve(req.result.value as AppSettings);
        } else {
          resolve(null);
        }
      };
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.error('getSettingsFromDB error:', e);
    return null;
  }
}

/**
 * Save App Settings to IDB
 */
export async function saveSettingsToDB(settings: AppSettings, existingDb?: IDBDatabase): Promise<void> {
  try {
    const db = existingDb || (await openDatabase());
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_SETTINGS, 'readwrite');
      const store = tx.objectStore(STORE_SETTINGS);
      const req = store.put({ key: 'app_settings', value: settings, updatedAt: Date.now() });

      req.onsuccess = () => {
        try {
          localStorage.setItem(SETTINGS_LS_KEY, JSON.stringify(settings));
        } catch (_) {}
        resolve();
      };
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.error('saveSettingsToDB error:', e);
  }
}

/**
 * Store Media / Video File directly in IDB (supports large video files)
 */
export async function storeMediaFileDB(id: string, file: File | Blob): Promise<string> {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_MEDIA, 'readwrite');
      const store = tx.objectStore(STORE_MEDIA);
      const req = store.put({
        id,
        file,
        type: file.type,
        name: (file as File).name || 'video',
        createdAt: Date.now(),
      });

      req.onsuccess = () => {
        const objectUrl = URL.createObjectURL(file);
        resolve(objectUrl);
      };
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.error('storeMediaFileDB error:', e);
    return URL.createObjectURL(file);
  }
}

/**
 * Get Media / Video object URL from IDB
 */
export async function getMediaFileUrlDB(id: string): Promise<string | null> {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_MEDIA, 'readonly');
      const store = tx.objectStore(STORE_MEDIA);
      const req = store.get(id);

      req.onsuccess = () => {
        if (req.result && req.result.file) {
          const url = URL.createObjectURL(req.result.file);
          resolve(url);
        } else {
          resolve(null);
        }
      };
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.error('getMediaFileUrlDB error:', e);
    return null;
  }
}

/**
 * Store ONNX model binary buffer (ArrayBuffer) with OPFS (Origin Private File System) priority & IDB fallback
 */
export async function storeModelBufferDB(key: string, buffer: ArrayBuffer, name?: string): Promise<void> {
  const fileName = `model-${key}.onnx`;
  // Try OPFS storage first
  try {
    if (typeof navigator !== 'undefined' && navigator.storage?.getDirectory) {
      const root = await navigator.storage.getDirectory();
      const fileHandle = await root.getFileHandle(fileName, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(buffer);
      await writable.close();
      console.log(`[OPFS Storage] Successfully stored ${fileName} (${(buffer.byteLength / 1024 / 1024).toFixed(2)} MB)`);
    }
  } catch (e) {
    console.warn('[OPFS Storage] Could not write to OPFS, using IndexedDB fallback:', e);
  }

  // Dual store to IndexedDB as fallback
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_MEDIA, 'readwrite');
      const store = tx.objectStore(STORE_MEDIA);
      const req = store.put({
        id: `model-${key}`,
        buffer,
        name: name || key,
        updatedAt: Date.now(),
      });

      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.error('storeModelBufferDB error:', e);
  }
}

/**
 * Retrieve ONNX model binary buffer (ArrayBuffer) from OPFS priority or IDB fallback
 */
export async function getModelBufferDB(key: string): Promise<ArrayBuffer | null> {
  const fileName = `model-${key}.onnx`;
  // 1. Try OPFS first for instant SSD-to-RAM load (<1s)
  try {
    if (typeof navigator !== 'undefined' && navigator.storage?.getDirectory) {
      const root = await navigator.storage.getDirectory();
      const fileHandle = await root.getFileHandle(fileName, { create: false });
      const file = await fileHandle.getFile();
      const buf = await file.arrayBuffer();
      if (buf.byteLength >= 100000) {
        console.log(`[OPFS Storage] Loaded ${fileName} directly from OPFS (${(buf.byteLength / 1024 / 1024).toFixed(2)} MB)`);
        return buf;
      }
    }
  } catch (_e) {
    // OPFS file not found or not supported, continue to IDB fallback
  }

  // 2. Fallback to IndexedDB
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_MEDIA, 'readonly');
      const store = tx.objectStore(STORE_MEDIA);
      const req = store.get(`model-${key}`);

      req.onsuccess = () => {
        if (req.result && req.result.buffer) {
          resolve(req.result.buffer as ArrayBuffer);
        } else {
          resolve(null);
        }
      };
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.error('getModelBufferDB error:', e);
    return null;
  }
}

/**
 * Delete ONNX model binary buffer from OPFS & IDB
 */
export async function deleteModelBufferDB(key: string): Promise<void> {
  const fileName = `model-${key}.onnx`;
  try {
    if (typeof navigator !== 'undefined' && navigator.storage?.getDirectory) {
      const root = await navigator.storage.getDirectory();
      await root.removeEntry(fileName).catch(() => {});
    }
  } catch (_e) {}

  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_MEDIA, 'readwrite');
      const store = tx.objectStore(STORE_MEDIA);
      const req = store.delete(`model-${key}`);

      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.error('deleteModelBufferDB error:', e);
  }
}

