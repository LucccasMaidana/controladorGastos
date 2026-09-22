-- ============================================================================
-- LIBRETA CONTABLE Y GESTOR DE SERVICIOS FAMILIARES
-- Esquema de Base de Datos para Supabase (PostgreSQL) - VERSIÓN DEFINITIVA
-- ============================================================================

-- 1. Habilitar extensión para UUIDs
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Conceder uso del esquema a los roles de Supabase (anon y authenticated)
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- 3. TABLA: wallets (Billeteras / Canales de custodia)
CREATE TABLE IF NOT EXISTS public.wallets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('CASH', 'DIGITAL')),
    current_balance NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. TABLA: transactions (Movimientos de la libreta)
CREATE TABLE IF NOT EXISTS public.transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    amount NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
    type TEXT NOT NULL CHECK (type IN ('INCOME', 'EXPENSE', 'TRANSFER')),
    wallet_type TEXT NOT NULL CHECK (wallet_type IN ('CASH', 'DIGITAL')),
    category TEXT NOT NULL,
    note TEXT,
    is_synced BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. TABLA: bills (Facturas de servicios y compromisos fijos)
CREATE TABLE IF NOT EXISTS public.bills (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    service_name TEXT NOT NULL,
    amount NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
    due_date DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PAID')),
    paid_at TIMESTAMPTZ,
    paid_cash_amount NUMERIC(12, 2) DEFAULT 0.00,
    paid_digital_amount NUMERIC(12, 2) DEFAULT 0.00,
    created_by TEXT DEFAULT 'Lucas - PC',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. CONCEDER TODOS LOS PERMISOS EN LAS TABLAS AL ROL ANON
GRANT ALL ON TABLE public.wallets TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.transactions TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.bills TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;

-- 7. ÍNDICES DE ALTO RENDIMIENTO
CREATE INDEX IF NOT EXISTS idx_transactions_date ON public.transactions(date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_wallet ON public.transactions(wallet_type);
CREATE INDEX IF NOT EXISTS idx_bills_status ON public.bills(status);
CREATE INDEX IF NOT EXISTS idx_bills_due_date ON public.bills(due_date ASC);
CREATE INDEX IF NOT EXISTS idx_bills_updated_at ON public.bills(updated_at DESC);

-- 8. TRIGGER AUTOMÁTICO PARA ACTUALIZAR updated_at
CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_wallets_updated_at ON public.wallets;
CREATE TRIGGER tr_wallets_updated_at BEFORE UPDATE ON public.wallets FOR EACH ROW EXECUTE FUNCTION update_modified_column();

DROP TRIGGER IF EXISTS tr_transactions_updated_at ON public.transactions;
CREATE TRIGGER tr_transactions_updated_at BEFORE UPDATE ON public.transactions FOR EACH ROW EXECUTE FUNCTION update_modified_column();

DROP TRIGGER IF EXISTS tr_bills_updated_at ON public.bills;
CREATE TRIGGER tr_bills_updated_at BEFORE UPDATE ON public.bills FOR EACH ROW EXECUTE FUNCTION update_modified_column();

-- 9. POLÍTICAS DE ROW LEVEL SECURITY (Seguras y sin fallos por duplicados)
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bills ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permitir todo acceso a wallets" ON public.wallets;
CREATE POLICY "Permitir todo acceso a wallets" ON public.wallets FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir todo acceso a transactions" ON public.transactions;
CREATE POLICY "Permitir todo acceso a transactions" ON public.transactions FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir todo acceso a bills" ON public.bills;
CREATE POLICY "Permitir todo acceso a bills" ON public.bills FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- 10. REGISTROS INICIALES DE BILLETERAS (Si no existen)
INSERT INTO public.wallets (name, type, current_balance)
SELECT 'Billetes en Mano', 'CASH', 0.00
WHERE NOT EXISTS (SELECT 1 FROM public.wallets WHERE type = 'CASH');

INSERT INTO public.wallets (name, type, current_balance)
SELECT 'Cuenta Digital / MP', 'DIGITAL', 0.00
WHERE NOT EXISTS (SELECT 1 FROM public.wallets WHERE type = 'DIGITAL');

-- 11. Habilitar Publicación en Realtime de forma segura
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.bills;
  EXCEPTION WHEN duplicate_object THEN
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.transactions;
  EXCEPTION WHEN duplicate_object THEN
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.wallets;
  EXCEPTION WHEN duplicate_object THEN
  END;
END $$;
