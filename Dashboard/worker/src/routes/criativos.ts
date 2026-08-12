import { Hono } from 'hono'
import { getSupabase, getDateRange, getFilters, fetchAll, type Env } from '../lib/supabase'

const criativos = new Hono<{ Bindings: Env }>()

criativos.get('/', async (c) => {
    const supabase = getSupabase(c.env)
    const url = new URL(c.req.url)
    const { data_inicio, data_fim } = getDateRange(url)
    const filters = getFilters(url)

    // Leads no período (por created_at) — inclui pago e valor para conversão correta
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

    // Buscar tracking — busca paginada
    const trackFilters: { column: string; op: string; value: any }[] = []
    if (filters.campanha) trackFilters.push({ column: 'campanha', op: 'eq', value: filters.campanha })
    if (filters.anuncio) trackFilters.push({ column: 'anuncio', op: 'eq', value: filters.anuncio })

    let leads: any[]
    let pagos: any[]
    let tracking: any[]
    try {
        ;[leads, pagos, tracking] = await Promise.all([
            fetchAll(supabase, 'bd_recheios_followup', 'telefone, session_id, pago, valor_pagamento', leadsFilters),
            fetchAll(supabase, 'bd_recheios_followup', 'telefone, session_id, valor_pagamento', pagosFilters),
            fetchAll(supabase, 'tracking_zap_face', 'telefone, anuncio, campanha', trackFilters.length > 0 ? trackFilters : undefined),
        ])
    } catch (e: any) {
        return c.json({ error: e.message }, 500)
    }

    const trackMap = new Map<string, { anuncio: string; campanha: string }>()
    for (const t of tracking) {
        if (t.telefone && t.anuncio) {
            trackMap.set(t.telefone, { anuncio: t.anuncio, campanha: t.campanha || 'Sem campanha' })
        }
    }

    // Agrupa leads por criativo (campanha + anuncio) — created_at
    // total_leads e pagos_do_periodo vêm dos leads (created_at)
    const criativoMap = new Map<string, { campanha: string; anuncio: string; total: number; pagos_periodo: number; vendas_faturamento: number; faturamento: number; valores: number[] }>()
    for (const lead of leads) {
        const tel = lead.telefone || lead.session_id
        const track = tel ? trackMap.get(tel) : null
        const campanha = track ? track.campanha : 'Orgânico'
        const anuncio = track ? track.anuncio : 'Orgânico'
        const key = `${campanha}|||${anuncio}`
        const existing = criativoMap.get(key) || { campanha, anuncio, total: 0, pagos_periodo: 0, vendas_faturamento: 0, faturamento: 0, valores: [] }
        existing.total++
        if (lead.pago === true) {
            existing.pagos_periodo++
        }
        criativoMap.set(key, existing)
    }

    // Agrupa pagos por criativo (campanha + anuncio) — data_pagamento — apenas para faturamento
    for (const pago of pagos) {
        const tel = pago.telefone || pago.session_id
        const track = tel ? trackMap.get(tel) : null
        const campanha = track ? track.campanha : 'Orgânico'
        const anuncio = track ? track.anuncio : 'Orgânico'
        const key = `${campanha}|||${anuncio}`
        const existing = criativoMap.get(key) || { campanha, anuncio, total: 0, pagos_periodo: 0, vendas_faturamento: 0, faturamento: 0, valores: [] }
        const valor = Number(pago.valor_pagamento) || 0
        existing.vendas_faturamento++
        existing.faturamento += valor
        existing.valores.push(valor)
        criativoMap.set(key, existing)
    }

    const result = Array.from(criativoMap.values())
        .map((data) => {
            const valoresAgrupados: { valor: number; quantidade: number }[] = []
            const valMap = new Map<number, number>()
            for (const v of data.valores) {
                valMap.set(v, (valMap.get(v) || 0) + 1)
            }
            for (const [valor, quantidade] of valMap.entries()) {
                valoresAgrupados.push({ valor, quantidade })
            }
            valoresAgrupados.sort((a, b) => b.valor - a.valor)

            return {
                anuncio: data.anuncio,
                campanha: data.campanha,
                total_leads: data.total,
                total_vendas: data.pagos_periodo,
                faturamento: data.faturamento,
                valores_detalhados: valoresAgrupados,
                taxa_conversao: data.total > 0 ? Math.round((data.pagos_periodo / data.total) * 1000) / 10 : 0,
            }
        })
        .sort((a, b) => b.faturamento - a.faturamento)

    return c.json(result)
})

export default criativos
