import { Hono } from 'hono'
import { getSupabase, getDateRange, getFilters, type Env } from '../lib/supabase'

const funil = new Hono<{ Bindings: Env }>()

funil.get('/', async (c) => {
    const supabase = getSupabase(c.env)
    const url = new URL(c.req.url)
    const { data_inicio, data_fim } = getDateRange(url)
    const filters = getFilters(url)

    // Leads no período (por created_at) — inclui pago para conversão correta
    let query = supabase
        .from('bd_recheios_followup')
        .select('pago, recebeu_acesso')
        .gte('created_at', data_inicio)
        .lte('created_at', data_fim)

    if (filters.produto) query = query.eq('produto', filters.produto)

    // Pagos no período (por data_pagamento) — apenas para faturamento
    let pagosQuery = supabase
        .from('bd_recheios_followup')
        .select('valor_pagamento')
        .eq('pago', true)
        .not('data_pagamento', 'is', null)
        .gte('data_pagamento', data_inicio)
        .lte('data_pagamento', data_fim)

    if (filters.produto) pagosQuery = pagosQuery.eq('produto', filters.produto)

    const [{ data, error }, { data: pagosData, error: pagosError }] = await Promise.all([query, pagosQuery])
    if (error) return c.json({ error: error.message }, 500)
    if (pagosError) return c.json({ error: pagosError.message }, 500)

    const total_leads = data?.length || 0
    const receberam_acesso = data?.filter(d => d.recebeu_acesso === true).length || 0
    // Pagaram = leads do período que pagaram (mesma população)
    const pagaram = data?.filter(d => d.pago === true).length || 0
    const faturamento = pagosData?.reduce((sum, d) => sum + (Number(d.valor_pagamento) || 0), 0) || 0

    return c.json({ total_leads, receberam_acesso, pagaram, faturamento })
})

export default funil
