import { Hono } from 'hono'
import { getSupabase, getDateRange, getPreviousDateRange, getFilters, type Env } from '../lib/supabase'

const metrics = new Hono<{ Bindings: Env }>()

metrics.get('/', async (c) => {
    const supabase = getSupabase(c.env)
    const url = new URL(c.req.url)
    const { data_inicio, data_fim } = getDateRange(url)
    const filters = getFilters(url)
    const { prev_inicio, prev_fim } = getPreviousDateRange(data_inicio, data_fim)

    // Query leads no período (por created_at)
    let query = supabase
        .from('bd_recheios_followup')
        .select('pago, recebeu_acesso, clicou_url, finalizado', { count: 'exact' })
        .gte('created_at', data_inicio)
        .lte('created_at', data_fim)

    if (filters.produto) query = query.eq('produto', filters.produto)
    if (filters.pago === 'true') query = query.eq('pago', true)
    if (filters.pago === 'false') query = query.eq('pago', false)

    const { data, count, error } = await query
    if (error) return c.json({ error: error.message }, 500)

    // Pagos no período — filtrado por data_pagamento (valor pago do dia)
    let pagosQuery = supabase
        .from('bd_recheios_followup')
        .select('valor_pagamento')
        .eq('pago', true)
        .not('data_pagamento', 'is', null)
        .gte('data_pagamento', data_inicio)
        .lte('data_pagamento', data_fim)

    if (filters.produto) pagosQuery = pagosQuery.eq('produto', filters.produto)

    const { data: pagosData } = await pagosQuery

    // Pagos no período anterior (por data_pagamento)
    let prevPagosQuery = supabase
        .from('bd_recheios_followup')
        .select('valor_pagamento')
        .eq('pago', true)
        .not('data_pagamento', 'is', null)
        .gte('data_pagamento', prev_inicio)
        .lte('data_pagamento', prev_fim)

    if (filters.produto) prevPagosQuery = prevPagosQuery.eq('produto', filters.produto)

    const { data: prevPagosData } = await prevPagosQuery

    // Período anterior leads
    let prevQuery = supabase
        .from('bd_recheios_followup')
        .select('pago, recebeu_acesso, finalizado', { count: 'exact' })
        .gte('created_at', prev_inicio)
        .lte('created_at', prev_fim)

    if (filters.produto) prevQuery = prevQuery.eq('produto', filters.produto)

    const { data: prevData, count: prevCount } = await prevQuery

    const total_leads = count || 0
    const total_pagos = pagosData?.length || 0
    const faturamento = pagosData?.reduce((sum, d) => sum + (Number(d.valor_pagamento) || 0), 0) || 0
    const receberam_acesso = data?.filter(d => d.recebeu_acesso === true).length || 0
    const finalizados_sem_pagar = data?.filter(d => d.finalizado === true && d.pago !== true).length || 0
    // Taxa de conversão: pagos (data_pagamento) / total_leads — consistente com card Leads Pagantes
    const taxa_conversao = total_leads > 0 ? Math.round((total_pagos / total_leads) * 1000) / 10 : 0
    const taxa_acesso_pagamento = receberam_acesso > 0 ? Math.round((total_pagos / receberam_acesso) * 1000) / 10 : 0

    const prev_total = prevCount || 0
    const prev_pagos = prevPagosData?.length || 0
    const prev_faturamento = prevPagosData?.reduce((sum, d) => sum + (Number(d.valor_pagamento) || 0), 0) || 0
    const prev_receberam_acesso = prevData?.filter(d => d.recebeu_acesso === true).length || 0
    const prev_finalizados_sem_pagar = prevData?.filter(d => d.finalizado === true && d.pago !== true).length || 0
    const prev_taxa = prev_total > 0 ? Math.round((prev_pagos / prev_total) * 1000) / 10 : 0
    const prev_taxa_acesso = prev_receberam_acesso > 0 ? Math.round((prev_pagos / prev_receberam_acesso) * 1000) / 10 : 0

    return c.json({
        total_leads,
        total_pagos,
        faturamento,
        taxa_conversao,
        receberam_acesso,
        taxa_acesso_pagamento,
        finalizados_sem_pagar,
        comparacao: {
            total_leads: prev_total,
            total_pagos: prev_pagos,
            faturamento: prev_faturamento,
            taxa_conversao: prev_taxa,
            receberam_acesso: prev_receberam_acesso,
            taxa_acesso_pagamento: prev_taxa_acesso,
            finalizados_sem_pagar: prev_finalizados_sem_pagar,
        }
    })
})

export default metrics
