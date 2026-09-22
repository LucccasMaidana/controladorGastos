# 📒 Controlador de Gastos y Libreta Contable Familiar

Aplicación **Offline-First** diseñada para registrar cobros y gastos diarios (efectivo físico y dinero digital), combinada con un panel web para administrar y liquidar facturas de servicios del hogar.

---

## 🌟 Características Principales

### 📱 Para la Usuaria Principal (Celular / Mamá)
- **Interfaz Accesible de Alto Contraste:**
  - 🟢 **Tarjeta Verde:** Billetes en Mano (Efectivo físico disponible).
  - 🟣 **Tarjeta Azul/Violeta:** Cuenta Digital (Mercado Pago / Banco).
  - ⚠️ **Tarjeta de Alerta:** Facturas pendientes de la casa por pagar.
- **Teclado Numérico Gigante Integrado:**
  - Registra montos al instante en pantalla sin abrir el teclado virtual nativo del teléfono.
  - Conmutador rápido: `[ 💵 Billete ]` / `[ 💳 Digital ]`.
  - Categorías táctiles inmediatas: *Cobro jornada, Supermercado, Viáticos, Farmacia, Propina, Varios*.
- **100% Funcional Sin Conexión (Offline-First):**
  - Toda lectura y escritura se realiza con 0 ms de latencia en **IndexedDB**.
- **Historial y Facturas:**
  - Cronología día por día con filtros por tipo de billetera.
  - Lista de boletas con días restantes para su vencimiento.

### 💻 Para el Administrador (PC / Lucas)
- **Panel Web de Control:**
  - Métricas en tiempo real: Efectivo en mano, Saldo digital, Deuda de servicios y Balance Real Neto.
  - Carga rápida de nuevas facturas con accesos directos (*Luz Edenor, Gas Naturgy, Internet, AySA, etc.*).
- **Módulo de Liquidación con Desglose:**
  - Permite liquidar una factura dividiendo el pago: `$X en efectivo + $Y en digital`.
  - Valida en tiempo real que la suma coincida con el total.
  - **Generación automática de egresos:** Al liquidar, descuenta automáticamente los saldos de la libreta contable.
- **Sincronización con Supabase (Nube):**
  - Sincronización bidireccional silenciosa y en tiempo real.

---

## 🚀 Puesta en Marcha Local

1. Clonar el repositorio:
   ```bash
   git clone https://github.com/LucccasMaidana/controladorGastos.git
   ```
2. Iniciar el servidor local (ej. con Python o Vite):
   ```bash
   python -m http.server 5173
   ```
3. Abrir en el navegador:
   `http://localhost:5173`

---

## ☁️ Configuración de Base de Datos (Supabase)

1. Crear un proyecto en [Supabase](https://supabase.com).
2. Abrir el **SQL Editor** y ejecutar el script `supabase_schema.sql`.
3. En la app web, presionar el botón **"☁️ Supabase"** e ingresar el **Project URL** y la **Project API Key (anon)**.
