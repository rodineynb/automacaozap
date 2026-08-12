import { Hono } from 'hono'
import { getSupabase, getDateRange, getFilters, extractDateSP, type Env } from '../lib/supabase'

const leadsPorDia = new Hono<{ Bindings: Env }>()

leadsPorDia.get('/', async (c) => {
    const supabase = getSupabase(c.env)
    const url = new URL(c.req.url)
    const { data_inicio, data_fim } = getDateRange(url)
    const filters = getFilters(url)

    // Leads totais por dia (created_at)
    let leadsQuery = supabase
        .from('bd_recheios_followup')
        .select('created_at')
        .gte('created_at', data_inicio)
        .lte('created_at', data_fim)

    if (filters.produto) leadsQuery = leadsQuery.eq('produto', filters.produto)
    if (filters.pago === 'true') leadsQuery = leadsQuery.eq('pago', true)
    if (filters.pago === 'false') leadsQuery = leadsQuery.eq('pago', false)

    // Pagos por dia (data_pagamento — independente de quando entrou)
    let pagosQuery = supabase
        .from('bd_recheios_followup')
        .select('data_pagamento, valor_pagamento')
        .eq('pago', true)
        .not('data_pagamento', 'is', null)
        .gte('data_pagamento', data_inicio)
        .lte('data_pagamento', data_fim)

    if (filters.produto) pagosQuery = pagosQuery.eq('produto', filters.produto)

    const [{ data: leadsData, error: leadsError }, { data: pagosData, error: pagosError }] = await Promise.all([leadsQuery, pagosQuery])
    if (leadsError) return c.json({ error: leadsError.message }, 500)
    if (pagosError) return c.json({ error: pagosError.message }, 500)

    // Agrupar leads por dia de created_at
    const porDia = new Map<string, { total: number; pagos: number; faturamento: number }>()
    for (const lead of leadsData || []) {
        const dia = extractDateSP(lead.created_at || '')
        if (!dia || dia.length < 10) continue
        const existing = porDia.get(dia) || { total: 0, pagos: 0, faturamento: 0 }
        existing.total++
        porDia.set(dia, existing)
    }

    // Agrupar pagos por dia de data_pagamento
    for (const pago of pagosData || []) {
        const dia = extractDateSP(pago.data_pagamento || '')
        if (!dia || dia.length < 10) continue
        const existing = porDia.get(dia) || { total: 0, pagos: 0, faturamento: 0 }
        existing.pagos++
        existing.faturamento += Number(pago.valor_pagamento) || 0
        porDia.set(dia, existing)
    }

    const result = Array.from(porDia.entries())
        .map(([dia, d]) => ({ dia, total_leads: d.total, total_pagos: d.pagos, faturamento: d.faturamento }))
        .sort((a, b) => a.dia.localeCompare(b.dia))

    return c.json(result)
})

export default leadsPorDia
