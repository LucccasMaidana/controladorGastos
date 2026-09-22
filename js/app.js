/**
 * ============================================================================
 * MAIN APPLICATION COORDINATOR (APP.JS)
 * Inicialización, selector de vistas (Móvil / PC / Split) y eventos globales
 * ============================================================================
 */

import { initializeDefaultWallets, getAllFromStore, getConfig, setConfig } from './db/indexedDb.js';
import { initMobileApp } from './components/mobile/mobileApp.js';
import { initAdminApp } from './components/admin/adminApp.js';
import { initSyncEngine, onSyncStateChange, runSyncCycle } from './services/sync.js';
import { createBill, registerIncome } from './services/accounting.js';

let currentLayoutMode = 'SPLIT'; // 'MOBILE', 'ADMIN', 'SPLIT'

async function startApp() {
  console.log('🚀 Inicializando Libreta Contable y Gestor de Servicios...');
  try {
    // 1. Inicializar almacenamiento local y billeteras
    await initializeDefaultWallets();

    // Configurar automáticamente las credenciales de Supabase del usuario
    const savedUrl = await getConfig('supabase_url');
    if (!savedUrl) {
      await setConfig('supabase_url', 'https://nwvlfokefiapslqeggcn.supabase.co');
      await setConfig('supabase_anon_key', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im53dmxmb2tlZmlhcHNscWVnZ2NuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAxMDA2OTUsImV4cCI6MjEwNTY3NjY5NX0.S5n5qbUm6ZLhAnpehH3B2nlF9d6wk1fKGiv-8Ttrfdk');
    }

    // 2. Si la base está totalmente nueva, sembrar 2 ejemplos iniciales para que Lucas vea cómo luce
    await seedInitialDataIfEmpty();

    // 3. Montar componentes de vistas
    const mobileRoot = document.getElementById('mobile-app-root');
    const adminRoot = document.getElementById('admin-app-root');

    if (mobileRoot) initMobileApp(mobileRoot);
    if (adminRoot) initAdminApp(adminRoot);

    // 4. Iniciar motor de sincronización
    initSyncEngine();

    // 5. Configurar selector de vistas en el Shell de Localhost
    setupViewSwitcher();

    // 6. Configurar monitoreo de estado de sincronización en la barra superior
    setupSyncStatusPill();

    // 7. Reloj en vivo de la barra de estado del celular simulado
    updatePhoneClock();
    setInterval(updatePhoneClock, 30000);
    console.log('✅ Aplicación iniciada exitosamente');
  } catch (err) {
    console.error('❌ Error al inicializar la aplicación:', err);
    document.body.insertAdjacentHTML('afterbegin', `
      <div style="background: #e11d48; color: white; padding: 16px; font-weight: bold; position: fixed; top: 0; left: 0; right: 0; z-index: 99999; text-align: center;">
        Ocurrió un error al cargar la aplicación: ${err.message}. Revisa la consola del navegador (F12).
      </div>
    `);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startApp);
} else {
  startApp();
}

/**
 * Sembrar datos iniciales demostrativos si es la primera apertura
 */
async function seedInitialDataIfEmpty() {
  const bills = await getAllFromStore('bills');
  const transactions = await getAllFromStore('transactions');

  if (bills.length === 0 && transactions.length === 0) {
    console.log('🌱 Sembrando datos demostrativos iniciales...');
    
    // Registrar un cobro inicial para mamá
    await registerIncome({
      walletType: 'CASH',
      amount: 25000,
      category: 'Cobro jornada',
      note: 'Casa Sra. Marta'
    });

    await registerIncome({
      walletType: 'DIGITAL',
      amount: 18000,
      category: 'Cobro jornada',
      note: 'Transferencia por limpieza'
    });

    // Cargar 2 facturas pendientes de prueba para la casa
    const nextWeek = new Date(Date.now() + 6 * 86400000).toISOString().split('T')[0];
    const twoWeeks = new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0];

    await createBill({
      serviceName: 'Edenor / Luz',
      amount: 12850,
      dueDate: nextWeek,
      createdBy: 'Lucas - PC'
    });

    await createBill({
      serviceName: 'Internet / WiFi',
      amount: 8500,
      dueDate: twoWeeks,
      createdBy: 'Lucas - PC'
    });
  }
}

/**
 * Control del Switcher de Vistas (Celular / PC / Dividida)
 */
function setupViewSwitcher() {
  const canvas = document.getElementById('workspace-canvas');
  const mobileContainer = document.getElementById('mobile-viewport-container');
  const adminContainer = document.getElementById('admin-viewport-container');

  const btnMobile = document.getElementById('btn-view-mobile');
  const btnAdmin = document.getElementById('btn-view-admin');
  const btnSplit = document.getElementById('btn-view-split');

  function applyLayout(mode) {
    currentLayoutMode = mode;

    btnMobile.classList.remove('active');
    btnAdmin.classList.remove('active');
    btnSplit.classList.remove('active');

    if (mode === 'MOBILE') {
      btnMobile.classList.add('active');
      canvas.className = 'layout-mobile-only';
      mobileContainer.style.display = 'block';
      adminContainer.style.display = 'none';
    } else if (mode === 'ADMIN') {
      btnAdmin.classList.add('active');
      canvas.className = 'layout-admin-only';
      mobileContainer.style.display = 'none';
      adminContainer.style.display = 'block';
    } else {
      btnSplit.classList.add('active');
      canvas.className = 'layout-split';
      mobileContainer.style.display = 'block';
      adminContainer.style.display = 'block';
    }
  }

  btnMobile.addEventListener('click', () => applyLayout('MOBILE'));
  btnAdmin.addEventListener('click', () => applyLayout('ADMIN'));
  btnSplit.addEventListener('click', () => applyLayout('SPLIT'));

  // Aplicar layout inicial
  applyLayout('SPLIT');

  // Botón superior de Supabase abre el modal de configuración en el admin
  document.getElementById('btn-shell-settings')?.addEventListener('click', () => {
    applyLayout('SPLIT');
    document.getElementById('btn-open-settings')?.click();
  });
}

/**
 * Indicador de sincronización en la barra superior
 */
function setupSyncStatusPill() {
  const syncPill = document.getElementById('shell-sync-pill');
  const textStatus = document.getElementById('sync-text-status');
  const mobileIcon = document.getElementById('mobile-header-sync');

  onSyncStateChange((state) => {
    if (!state.isOnline) {
      syncPill.className = 'sync-pill offline';
      textStatus.textContent = 'Modo Local (Offline)';
      if (mobileIcon) mobileIcon.textContent = '🟡';
    } else if (state.isSyncing) {
      syncPill.className = 'sync-pill syncing';
      textStatus.textContent = 'Sincronizando...';
      if (mobileIcon) mobileIcon.textContent = '🔄';
    } else {
      syncPill.className = 'sync-pill';
      textStatus.textContent = state.pendingCount > 0 ? `Sincronizado (${state.pendingCount} pend.)` : 'En Línea';
      if (mobileIcon) mobileIcon.textContent = '🟢';
    }
  });

  // Clic en la píldora fuerza una sincronización manual
  syncPill.addEventListener('click', () => {
    runSyncCycle('manual-click');
  });
}

/**
 * Reloj simulado en barra de estado
 */
function updatePhoneClock() {
  const clockEl = document.getElementById('phone-clock');
  if (clockEl) {
    const now = new Date();
    clockEl.textContent = now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  }
}
