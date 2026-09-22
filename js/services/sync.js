/**
 * ============================================================================
 * SYNC ENGINE (SINCRONIZACIÓN OPORTUNISTA Y TOLERANCIA A FALLOS)
 * Sincronización bidireccional silenciosa entre Local (IndexedDB) y Supabase
 * ============================================================================
 */

import { getAllFromStore, putInStore, getConfig, setConfig } from '../db/indexedDb.js';
import { 
  getSupabase, 
  pullBillsFromCloud, 
  pushTransactionToCloud, 
  pushWalletToCloud,
  pullWalletsFromCloud,
  pullTransactionsFromCloud,
  subscribeToRealtime 
} from '../db/supabase.js';
import { notifyAccountingChange } from './accounting.js';

let syncState = {
  isOnline: navigator.onLine,
  isSyncing: false,
  lastSync: null,
  pendingCount: 0
};

const syncListeners = new Set();

export function onSyncStateChange(callback) {
  syncListeners.add(callback);
  callback(syncState);
  return () => syncListeners.delete(callback);
}

function updateSyncState(partial) {
  syncState = { ...syncState, ...partial };
  syncListeners.forEach(cb => {
    try { cb(syncState); } catch (e) { console.error('Error en listener de sync:', e); }
  });
}

/**
 * Ejecutar ciclo completo de sincronización
 */
export async function runSyncCycle(triggerReason = 'manual') {
  if (!navigator.onLine) {
    updateSyncState({ isOnline: false, isSyncing: false });
    return { success: false, reason: 'offline' };
  }

  const supabase = await getSupabase();
  if (!supabase) {
    // Sin credenciales configuradas todavía: modo puramente local
    updateSyncState({ isOnline: true, isSyncing: false });
    return { success: true, mode: 'local-only' };
  }

  updateSyncState({ isOnline: true, isSyncing: true });

  try {
    let hasChanges = false;

    // 1. PUSH: Enviar transacciones locales pendientes
    const allTx = await getAllFromStore('transactions');
    const unsyncedTx = allTx.filter(t => !t.is_synced);
    updateSyncState({ pendingCount: unsyncedTx.length });

    for (const tx of unsyncedTx) {
      const ok = await pushTransactionToCloud(tx);
      if (ok) {
        tx.is_synced = true;
        await putInStore('transactions', tx);
      }
    }

    // 2. PUSH: Asegurar que todas las billeteras locales estén en la nube
    const localWallets = await getAllFromStore('wallets');
    for (const w of localWallets) {
      if (w.user_name && w.user_name.toLowerCase() !== 'usuario') {
        await pushWalletToCloud(w);
      }
    }

    // 3. PULL: Descargar billeteras remotas (para ver integrantes registrados en otros dispositivos)
    const remoteWallets = await pullWalletsFromCloud();
    if (remoteWallets && remoteWallets.length > 0) {
      for (const rw of remoteWallets) {
        const local = localWallets.find(lw => 
          lw.user_name?.toLowerCase() === rw.user_name?.toLowerCase() && lw.type === rw.type
        );
        if (!local) {
          await putInStore('wallets', rw);
          hasChanges = true;
        } else if (new Date(rw.updated_at) > new Date(local.updated_at || 0)) {
          await putInStore('wallets', rw);
          hasChanges = true;
        }
      }
    }

    // 4. PULL: Descargar transacciones remotas
    const lastTxSync = await getConfig('last_tx_sync_timestamp');
    const remoteTxs = await pullTransactionsFromCloud(lastTxSync);
    if (remoteTxs && remoteTxs.length > 0) {
      for (const rtx of remoteTxs) {
        const existing = allTx.find(t => t.id === rtx.id);
        if (!existing) {
          rtx.is_synced = true;
          await putInStore('transactions', rtx);
          hasChanges = true;
        }
      }
      await setConfig('last_tx_sync_timestamp', new Date().toISOString());
    }

    // 5. PULL: Descargar facturas actualizadas desde la nube
    const lastSyncTime = await getConfig('last_bills_sync_timestamp');
    const remoteBills = await pullBillsFromCloud(lastSyncTime);

    let newBillsCount = 0;
    if (remoteBills && remoteBills.length > 0) {
      for (const bill of remoteBills) {
        const localBills = await getAllFromStore('bills');
        const existing = localBills.find(b => b.id === bill.id);
        if (!existing && bill.status === 'PENDING') {
          newBillsCount++;
        }
        await putInStore('bills', bill);
        hasChanges = true;
      }
    }

    const now = new Date().toISOString();
    await setConfig('last_bills_sync_timestamp', now);

    // Si hay nuevas facturas y se soportan notificaciones, notificar:
    if (newBillsCount > 0) {
      triggerLocalBillNotification(newBillsCount);
    }

    // Si hubo cambios contables (usuarios nuevos, saldos actualizados), refrescar UI:
    if (hasChanges) {
      notifyAccountingChange();
    }

    updateSyncState({
      isSyncing: false,
      lastSync: now,
      pendingCount: 0
    });

    return { success: true, newBillsCount };
  } catch (error) {
    console.warn('Error durante el ciclo de sincronización:', error);
    updateSyncState({ isSyncing: false });
    return { success: false, error: error.message };
  }
}

/**
 * Notificación local visual / sonora al detectar facturas nuevas
 */
function triggerLocalBillNotification(count) {
  console.log(`🔔 Nuevas facturas detectadas: ${count}`);
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification('Factura de Servicio Recibida', {
      body: `Lucas ha cargado ${count} nueva(s) factura(s) para revisar.`,
      icon: 'assets/icon.png'
    });
  }
  // Vibración táctil si el dispositivo lo soporta
  if (navigator.vibrate) {
    navigator.vibrate([200, 100, 200]);
  }
}

/**
 * Iniciar observadores de red y ciclo de sincronización
 */
export function initSyncEngine() {
  window.addEventListener('online', () => {
    console.log('🌐 Conexión a internet restablecida');
    updateSyncState({ isOnline: true });
    runSyncCycle('network-online');
  });

  window.addEventListener('offline', () => {
    console.log('🔌 Conexión desconectada. Modo Offline-First activo');
    updateSyncState({ isOnline: false, isSyncing: false });
  });

  // Suscripción Realtime si Supabase está activo
  subscribeToRealtime((table, payload) => {
    console.log(`📡 Evento Realtime recibido en ${table}:`, payload);
    runSyncCycle('realtime-event');
  });

  // Sincronización oportunista inicial
  runSyncCycle('app-init');

  // Intervalo periódico cada 60s
  setInterval(() => {
    if (navigator.onLine && !syncState.isSyncing) {
      runSyncCycle('interval');
    }
  }, 60000);
}
