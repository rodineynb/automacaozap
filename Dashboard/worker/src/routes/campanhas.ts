import { Hono } from 'hono'
import { getSupabase, getDateRange, getFilters, fetchAll, type Env } from '../lib/supabase'

const campanhas = new Hono<{ Bindings: Env }>()

campanhas.get('/', async (c) => {
    const supabase = getSupabase(c.env)
    const url = new URL(c.req.url)
    const { data_inicio, data_fim } = getDateRange(url)
    const filters = getFilters(url)

    // Leads no período (por created_at) — inclui pago para conversão correta
    const leadsFilters: { column: string; op: string; value: any }[] = [
        { column: 'created_at', op: 'gte', value: data_inicio },
        { column: 'created_at', op: 'lte', value: data_fim },
    ]
    if (filters.produto) leadsFilters.push({ column: 'produto', op: 'eq', value: filters.produto })
    if (filters.pago === 'true') leadsFilters.push({ column: 'pago', op: 'eq', value: true })
    if (filters.pago === 'false') leadsFilters.push({ column: 'pago', op: 'eq', value: false })

    // Pagos no período (por data_pagamento) — apenas para faturamento do dia
    const pagosFilters: { column: string; op: string; value: any }[] = [
        { column: 'pago', op: 'eq', value: true },
        { column: 'data_pagamento', op: 'not_is_null', value: null },
        { column: 'data_pagamento', op: 'gte', value: data_inicio },
        { column: 'data_pagamento', op: 'lte', value: data_fim },
    ]
    if (filters.produto) pagosFilters.push({ column: 'produto', op: 'eq', value: filters.produto })

    // Tracking — busca paginada
    const trackFilters: { column: string; op: string; value: any }[] = []
    if (filters.campanha) trackFilters.push({ column: 'campanha', op: 'eq', value: filters.campanha })

    let leads: any[]
    let pagos: any[]
    let tracking: any[]
    try {
        ;[leads, pagos, tracking] = await Promise.all([
            fetchAll(supabase, 'bd_recheios_followup', 'telefone, session_id, pago', leadsFilters),
            fetchAll(supabase, 'bd_recheios_followup', 'telefone, session_id, valor_pagamento', pagosFilters),
            fetchAll(supabase, 'tracking_zap_face', 'telefone, campanha', trackFilters.length > 0 ? trackFilters : undefined),
        ])
    } catch (e: any) {
        return c.json({ error: e.message }, 500)
    }

    const trackMap = new Map<string, string>()
    for (const t of tracking) {
        if (t.telefone && t.campanha) trackMap.set(t.telefone, t.campanha)
    }

    // Leads totais por campanha (created_at) — inclui contagem de pagos do período
    const campanhaLeads = new Map<string, { total: number; pagos_periodo: number; pagos_faturamento: number; faturamento: number }>()
    for (const lead of leads) {
        const tel = lead.telefone || lead.session_id
        const campanha = (tel ? trackMap.get(tel) : null) || 'Sem campanha'
        const existing = campanhaLeads.get(campanha) || { total: 0, pagos_periodo: 0, pagos_faturamento: 0, faturamento: 0 }
        existing.total++
        if (lead.pago === true) {
            existing.pagos_periodo++
        }
        campanhaLeads.set(campanha, existing)
    }

    // Pagos por campanha (data_pagamento) — apenas para faturamento
    for (const pago of pagos) {
        const tel = pago.telefone || pago.session_id
        const campanha = (tel ? trackMap.get(tel) : null) || 'Sem campanha'
        const existing = campanhaLeads.get(campanha) || { total: 0, pagos_periodo: 0, pagos_faturamento: 0, faturamento: 0 }
        existing.pagos_faturamento++
        existing.faturamento += Number(pago.valor_pagamento) || 0
        campanhaLeads.set(campanha, existing)
    }

    const result = Array.from(campanhaLeads.entries())
        .map(([campanha, d]) => ({
            campanha,
            total_leads: d.total,
            total_pagos: d.pagos_periodo,
            faturamento: d.faturamento,
            taxa_conversao: d.total > 0 ? Math.round((d.pagos_periodo / d.total) * 1000) / 10 : 0,
        }))
        .sort((a, b) => b.faturamento - a.faturamento)

    return c.json(result)
})

export default campanhas
