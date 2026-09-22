/**
 * ============================================================================
 * INDEXED DB ADAPTER (OFFLINE-FIRST LOCAL STORAGE)
 * Almacenamiento local ultrarrápido (0 ms) con soporte ACID y colas de sincronización
 * ============================================================================
 */

const DB_NAME = 'LibretaContableDB';
const DB_VERSION = 2;

let dbInstance = null;

function generateUUID() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

export async function getDb() {
  if (dbInstance) return dbInstance;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = (e) => {
      console.error('Error abriendo IndexedDB:', e);
      reject(e.target.error);
    };

    request.onsuccess = (e) => {
      dbInstance = e.target.result;
      resolve(dbInstance);
    };

    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      const tx = e.target.transaction;

      // 1. Wallets Store
      if (!db.objectStoreNames.contains('wallets')) {
        const walletStore = db.createObjectStore('wallets', { keyPath: 'id' });
        walletStore.createIndex('user_name', 'user_name', { unique: false });
        walletStore.createIndex('type', 'type', { unique: false });
        walletStore.createIndex('user_wallet_type', ['user_name', 'type'], { unique: true });
      } else {
        const walletStore = tx.objectStore('wallets');
        if (walletStore.indexNames.contains('type')) {
          walletStore.deleteIndex('type');
        }
        walletStore.createIndex('type', 'type', { unique: false });
        if (!walletStore.indexNames.contains('user_name')) {
          walletStore.createIndex('user_name', 'user_name', { unique: false });
        }
        if (!walletStore.indexNames.contains('user_wallet_type')) {
          walletStore.createIndex('user_wallet_type', ['user_name', 'type'], { unique: true });
        }
      }

      // 2. Transactions Store
      if (!db.objectStoreNames.contains('transactions')) {
        const txStore = db.createObjectStore('transactions', { keyPath: 'id' });
        txStore.createIndex('user_name', 'user_name', { unique: false });
        txStore.createIndex('date', 'date', { unique: false });
        txStore.createIndex('wallet_type', 'wallet_type', { unique: false });
        txStore.createIndex('type', 'type', { unique: false });
        txStore.createIndex('is_synced', 'is_synced', { unique: false });
      } else {
        const txStore = tx.objectStore('transactions');
        if (!txStore.indexNames.contains('user_name')) {
          txStore.createIndex('user_name', 'user_name', { unique: false });
        }
      }

      // 3. Bills Store
      if (!db.objectStoreNames.contains('bills')) {
        const billStore = db.createObjectStore('bills', { keyPath: 'id' });
        billStore.createIndex('status', 'status', { unique: false });
        billStore.createIndex('due_date', 'due_date', { unique: false });
        billStore.createIndex('updated_at', 'updated_at', { unique: false });
      }

      // 4. Sync Queue Store (para operaciones offline pendientes)
      if (!db.objectStoreNames.contains('sync_queue')) {
        db.createObjectStore('sync_queue', { keyPath: 'id', autoIncrement: true });
      }

      // 5. Config Store (para credenciales de Supabase y última fecha de sync)
      if (!db.objectStoreNames.contains('config')) {
        db.createObjectStore('config', { keyPath: 'key' });
      }
    };
  });
}

/**
 * Inicializar billeteras por usuario de forma dinámica
 */
export async function initializeUserWallets(userName) {
  if (!userName) return [];
  const normalized = userName.trim();
  const wallets = await getAllFromStore('wallets');
  let userWallets = wallets.filter(w => w.user_name && w.user_name.toLowerCase() === normalized.toLowerCase());

  if (userWallets.length === 0) {
    const defaultWallets = [
      {
        id: generateUUID(),
        user_name: normalized,
        name: 'Billetes en Mano',
        type: 'CASH',
        current_balance: 0.00,
        updated_at: new Date().toISOString()
      },
      {
        id: generateUUID(),
        user_name: normalized,
        name: 'Cuenta Digital / MP',
        type: 'DIGITAL',
        current_balance: 0.00,
        updated_at: new Date().toISOString()
      }
    ];

    for (const w of defaultWallets) {
      await putInStore('wallets', w);
    }
    console.log(`✅ Billeteras creadas para: ${normalized}`);
    return defaultWallets;
  }
  return userWallets;
}

export async function initializeDefaultWallets() {
  // Mantener compatibilidad si se llama sin argumentos
  return;
}

/**
 * Vaciar todos los datos locales (Puesta a cero para producción)
 */
export async function clearAllLocalData() {
  const db = await getDb();
  const stores = ['wallets', 'transactions', 'bills', 'sync_queue'];
  return new Promise((resolve, reject) => {
    const tx = db.transaction(stores, 'readwrite');
    stores.forEach(s => tx.objectStore(s).clear());
    tx.oncomplete = () => {
      console.log('🧹 Base de datos local vaciada por completo');
      resolve(true);
    };
    tx.onerror = () => reject(tx.error);
  });
}

// ============================================================================
// HELPERS GENÉRICOS DE LECTURA / ESCRITURA
// ============================================================================

export async function getAllFromStore(storeName) {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

export async function getFromStore(storeName, key) {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const request = store.get(key);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

export async function putInStore(storeName, item) {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const request = store.put(item);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function deleteFromStore(storeName, key) {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const request = store.delete(key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// Config helpers
export async function getConfig(key, defaultValue = null) {
  const record = await getFromStore('config', key);
  return record ? record.value : defaultValue;
}

export async function setConfig(key, value) {
  return await putInStore('config', { key, value });
}
