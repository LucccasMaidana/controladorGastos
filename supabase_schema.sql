-- ============================================================================
-- LIBRETA CONTABLE Y GESTOR DE SERVICIOS FAMILIARES
-- Esquema de Base de Datos para Supabase (PostgreSQL)
-- ============================================================================

-- Habilitar extensión para UUIDs si no está habilitada
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. TABLA: wallets (Billeteras / Canales de custodia)
CREATE TABLE IF NOT EXISTS wallets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('CASH', 'DIGITAL')),
    current_balance NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. TABLA: transactions (Movimientos de la libreta)
CREATE TABLE IF NOT EXISTS transactions (
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

-- 3. TABLA: bills (Facturas de servicios y compromisos fijos)
CREATE TABLE IF NOT EXISTS bills (
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

-- 4. ÍNDICES DE ALTO RENDIMIENTO
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_wallet ON transactions(wallet_type);
CREATE INDEX IF NOT EXISTS idx_bills_status ON bills(status);
CREATE INDEX IF NOT EXISTS idx_bills_due_date ON bills(due_date ASC);
CREATE INDEX IF NOT EXISTS idx_bills_updated_at ON bills(updated_at DESC);

-- 5. TRIGGER AUTOMÁTICO PARA ACTUALIZAR updated_at
CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_wallets_updated_at ON wallets;
CREATE TRIGGER tr_wallets_updated_at BEFORE UPDATE ON wallets FOR EACH ROW EXECUTE FUNCTION update_modified_column();

DROP TRIGGER IF EXISTS tr_transactions_updated_at ON transactions;
CREATE TRIGGER tr_transactions_updated_at BEFORE UPDATE ON transactions FOR EACH ROW EXECUTE FUNCTION update_modified_column();

DROP TRIGGER IF EXISTS tr_bills_updated_at ON bills;
CREATE TRIGGER tr_bills_updated_at BEFORE UPDATE ON bills FOR EACH ROW EXECUTE FUNCTION update_modified_column();

-- 6. POLÍTICAS DE ACCESO Y PERMISOS
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;

ALTER TABLE wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE bills ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Permitir todo acceso a wallets" ON wallets FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Permitir todo acceso a transactions" ON transactions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Permitir todo acceso a bills" ON bills FOR ALL USING (true) WITH CHECK (true);

-- 7. REGISTROS INICIALES DE BILLETERAS (Si no existen)
INSERT INTO wallets (name, type, current_balance)
SELECT 'Billetes en Mano', 'CASH', 0.00
WHERE NOT EXISTS (SELECT 1 FROM wallets WHERE type = 'CASH');

INSERT INTO wallets (name, type, current_balance)
SELECT 'Cuenta Digital / MP', 'DIGITAL', 0.00
WHERE NOT EXISTS (SELECT 1 FROM wallets WHERE type = 'DIGITAL');

-- Habilitar Publicación en Realtime para sincronización instantánea
ALTER PUBLICATION supabase_realtime ADD TABLE bills;
ALTER PUBLICATION supabase_realtime ADD TABLE transactions;
ALTER PUBLICATION supabase_realtime ADD TABLE wallets;
