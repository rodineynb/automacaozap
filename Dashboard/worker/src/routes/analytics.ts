import { Hono } from 'hono'
import { getSupabase, getDateRange, fetchAll, type Env } from '../lib/supabase'

const analytics = new Hono<{ Bindings: Env }>()

analytics.get('/', async (c) => {
    const supabase = getSupabase(c.env)
    const url = new URL(c.req.url)
    const { data_inicio, data_fim } = getDateRange(url)

    // Buscar pagos no período — filtrado por data_pagamento (pagante conta no dia que pagou)
    let leads: any[]
    try {
        leads = await fetchAll(supabase, 'bd_recheios_followup', 'created_at, data_pagamento, pago, valor_pagamento', [
            { column: 'pago', op: 'eq', value: true },
            { column: 'data_pagamento', op: 'not_is_null', value: null },
            { column: 'data_pagamento', op: 'gte', value: data_inicio },
            { column: 'data_pagamento', op: 'lte', value: data_fim },
        ])
    } catch (e: any) {
        return c.json({ error: e.message }, 500)
    }

    // Filtrar apenas leads com data_pagamento válida
    const pagos = leads.filter(l => l.data_pagamento && l.created_at)

    if (pagos.length === 0) {
        return c.json({
            total_pagos: 0,
            tempo_medio_minutos: 0,
            tempo_mediana_minutos: 0,
            faixas: [],
            horas_quentes: [],
        })
    }

    // Calcular diferença de tempo em minutos para cada compra
    const tempos: number[] = []
    const horaCompra: number[] = [] // hora do dia da compra

    for (const lead of pagos) {
        const created = new Date(lead.created_at)
        const pagamento = new Date(lead.data_pagamento)
        const diffMs = pagamento.getTime() - created.getTime()
        const diffMin = diffMs / (1000 * 60)

        // Só considerar tempos positivos e razoáveis (até 30 dias)
        if (diffMin >= 0 && diffMin <= 43200) {
            tempos.push(diffMin)
        }

        // Hora de compra (horário SP)
        // O timestamp já vem com timezone, extrair hora de SP
        const horaSP = new Date(lead.data_pagamento).toLocaleString('en-US', {
            timeZone: 'America/Sao_Paulo',
            hour: 'numeric',
            hour12: false,
        })
        horaCompra.push(parseInt(horaSP) || 0)
    }

    // Ordenar tempos para calcular mediana
    tempos.sort((a, b) => a - b)

    // Média
    const soma = tempos.reduce((acc, t) => acc + t, 0)
    const media = tempos.length > 0 ? soma / tempos.length : 0

    // Mediana
    let mediana = 0
    if (tempos.length > 0) {
        const mid = Math.floor(tempos.length / 2)
        mediana = tempos.length % 2 !== 0 ? tempos[mid] : (tempos[mid - 1] + tempos[mid]) / 2
    }

    // Faixas de tempo
    const faixasConfig = [
        { label: 'Até 15min', min: 0, max: 15 },
        { label: '15min - 30min', min: 15, max: 30 },
        { label: '30min - 1h', min: 30, max: 60 },
        { label: '1h - 2h', min: 60, max: 120 },
        { label: '2h - 6h', min: 120, max: 360 },
        { label: '6h - 12h', min: 360, max: 720 },
        { label: '12h - 24h', min: 720, max: 1440 },
        { label: '24h+', min: 1440, max: Infinity },
    ]

    const faixas = faixasConfig.map(f => {
        const count = tempos.filter(t => t >= f.min && t < f.max).length
        return {
            label: f.label,
            quantidade: count,
            percentual: tempos.length > 0 ? Math.round((count / tempos.length) * 1000) / 10 : 0,
        }
    }).filter(f => f.quantidade > 0 || faixasConfig.indexOf(faixasConfig.find(fc => fc.label === f.label)!) < 5) // Sempre mostrar as primeiras 5

    // Horas quentes — quantas compras por hora do dia
    const horasMap = new Map<number, number>()
    for (let h = 0; h < 24; h++) horasMap.set(h, 0)
    for (const h of horaCompra) {
        horasMap.set(h, (horasMap.get(h) || 0) + 1)
    }

    const horas_quentes = Array.from(horasMap.entries())
        .map(([hora, quantidade]) => ({
            hora,
            label: `${String(hora).padStart(2, '0')}h`,
            quantidade,
            percentual: pagos.length > 0 ? Math.round((quantidade / pagos.length) * 1000) / 10 : 0,
        }))
        .sort((a, b) => a.hora - b.hora)

    return c.json({
        total_pagos: pagos.length,
        tempo_medio_minutos: Math.round(media * 10) / 10,
        tempo_mediana_minutos: Math.round(mediana * 10) / 10,
        faixas,
        horas_quentes,
    })
})

export default analytics
