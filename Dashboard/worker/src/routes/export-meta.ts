import { Hono } from 'hono'
import { getSupabase, type Env } from '../lib/supabase'

const exportMeta = new Hono<{ Bindings: Env }>()

/**
 * Exporta leads no formato CSV compatível com Meta Custom Audiences
 * 
 * Colunas: phone, email, fn, ln, country, value
 * - value: número decimal sem símbolo de moeda (Meta usa moeda da conta)
 */
exportMeta.get('/', async (c) => {
    const supabase = getSupabase(c.env)
    const url = new URL(c.req.url)
    const tipo = url.searchParams.get('tipo') || 'compradores'

    let query = supabase
        .from('bd_recheios_followup')
        .select('nome, telefone, email, valor_pagamento')

    if (tipo === 'compradores') {
        query = query.eq('pago', true)
    } else if (tipo === 'acesso') {
        query = query.eq('recebeu_acesso', true)
    } else if (tipo === 'acesso_sem_pagar') {
        query = query.eq('recebeu_acesso', true).neq('pago', true)
    } else if (tipo === 'sem_acesso') {
        query = query.neq('recebeu_acesso', true)
    }
    // tipo === 'todos' → sem filtro

    const { data, error } = await query
    if (error) return c.json({ error: error.message }, 500)

    if (!data || data.length === 0) {
        return c.text('Nenhum lead encontrado', 404)
    }

    function formatPhone(phone: string): string {
        let clean = phone.replace(/\D/g, '')
        if (clean.startsWith('55') && clean.length >= 12) return clean
        if (clean.length >= 10 && clean.length <= 11) return '55' + clean
        return clean
    }

    function splitName(nome: string | null): { fn: string; ln: string } {
        if (!nome || !nome.trim()) return { fn: '', ln: '' }
        const parts = nome.trim().toLowerCase().split(/\s+/)
        return {
            fn: parts[0] || '',
            ln: parts.length > 1 ? parts.slice(1).join(' ') : '',
        }
    }

    const headers = ['phone', 'email', 'fn', 'ln', 'country', 'value']
    const rows = data.map(lead => {
        const phone = formatPhone(lead.telefone || '')
        const email = (lead.email || '').toLowerCase().trim()
        const { fn, ln } = splitName(lead.nome)
        const value = lead.valor_pagamento ? Number(lead.valor_pagamento).toFixed(2) : ''
        return [phone, email, fn, ln, 'br', value].join(',')
    })

    const validRows = rows.filter(row => {
        const phone = row.split(',')[0]
        return phone.length >= 10
    })

    const csv = [headers.join(','), ...validRows].join('\n')

    const filename = tipo === 'compradores'
        ? 'meta_compradores.csv'
        : tipo === 'acesso'
            ? 'meta_acesso.csv'
            : tipo === 'acesso_sem_pagar'
                ? 'meta_acesso_sem_pagar.csv'
                : tipo === 'sem_acesso'
                    ? 'meta_sem_acesso.csv'
                    : 'meta_todos_leads.csv'

    return new Response(csv, {
        headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': `attachment; filename="${filename}"`,
            'Access-Control-Allow-Origin': '*',
        },
    })
})

export default exportMeta
