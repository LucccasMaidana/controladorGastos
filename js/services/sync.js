/**
 * ============================================================================
 * SYNC ENGINE (SINCRONIZACIÓN OPORTUNISTA Y TOLERANCIA A FALLOS)
 * Sincronización bidireccional silenciosa entre Local (IndexedDB) y Supabase
 * ============================================================================
 */

import { getAllFromStore, putInStore, getConfig, setConfig } from '../db/indexedDb.js';
import { getSupabase, pullBillsFromCloud, pushTransactionToCloud, subscribeToRealtime } from '../db/supabase.js';

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

    // 2. PULL: Descargar facturas actualizadas desde la nube
    const lastSyncTime = await getConfig('last_bills_sync_timestamp');
    const remoteBills = await pullBillsFromCloud(lastSyncTime);

    let newBillsCount = 0;
    if (remoteBills && remoteBills.length > 0) {
      for (const bill of remoteBills) {
        const local = await getAllFromStore('bills');
        const existing = local.find(b => b.id === bill.id);
        if (!existing && bill.status === 'PENDING') {
          newBillsCount++;
        }
        await putInStore('bills', bill);
      }
    }

    const now = new Date().toISOString();
    await setConfig('last_bills_sync_timestamp', now);

    // Si hay nuevas facturas y se soportan notificaciones, notificar:
    if (newBillsCount > 0) {
      triggerLocalBillNotification(newBillsCount);
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
