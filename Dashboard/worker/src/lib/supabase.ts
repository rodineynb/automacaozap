import { createClient } from '@supabase/supabase-js'

export interface Env {
    SUPABASE_URL: string
    SUPABASE_ANON_KEY: string
}

export function getSupabase(env: Env) {
    return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY)
}

// Busca todos os registros de uma tabela com paginação real (evita limite de 1000)
export async function fetchAll(
    supabase: any,
    table: string,
    columns: string,
    filters?: { column: string; op: string; value: any }[]
): Promise<any[]> {
    const PAGE_SIZE = 1000
    let allData: any[] = []
    let page = 0

    while (true) {
        let query = supabase
            .from(table)
            .select(columns)
            .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

        if (filters) {
            for (const f of filters) {
                if (f.op === 'eq') query = query.eq(f.column, f.value)
                else if (f.op === 'gte') query = query.gte(f.column, f.value)
                else if (f.op === 'lte') query = query.lte(f.column, f.value)
                else if (f.op === 'not_is_null') query = query.not(f.column, 'is', null)
            }
        }

        const { data, error } = await query
        if (error) throw error
        if (!data || data.length === 0) break

        allData = allData.concat(data)
        if (data.length < PAGE_SIZE) break
        page++
    }

    return allData
}

// Formatar data em São Paulo timezone (YYYY-MM-DD)
function formatDateSP(date: Date): string {
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    })
    return formatter.format(date)
}

// Sempre usar offset -03:00 (São Paulo) para comparar
// com created_at que está em timestamp with timezone America/Sao_Paulo
export function getDateRange(url: URL) {
    const now = new Date()
    const thirtyDaysAgo = new Date(now)
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const todaySP = formatDateSP(now)
    const thirtyAgoSP = formatDateSP(thirtyDaysAgo)

    const data_inicio = url.searchParams.get('data_inicio') || thirtyAgoSP
    const data_fim = url.searchParams.get('data_fim') || todaySP

    return {
        data_inicio: `${data_inicio}T00:00:00-03:00`,
        data_fim: `${data_fim}T23:59:59-03:00`,
    }
}

// Helper para calcular período anterior com offset SP
export function getPreviousDateRange(data_inicio: string, data_fim: string) {
    // Extrair apenas a data (YYYY-MM-DD) das strings com offset
    const startStr = data_inicio.split('T')[0]
    const endStr = data_fim.split('T')[0]

    const startDate = new Date(startStr + 'T12:00:00-03:00')
    const endDate = new Date(endStr + 'T12:00:00-03:00')
    const diffMs = endDate.getTime() - startDate.getTime()
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24))

    const prevEnd = new Date(startDate.getTime() - 1000 * 60 * 60 * 24) // dia antes do início
    const prevStart = new Date(prevEnd.getTime() - diffDays * 1000 * 60 * 60 * 24)

    return {
        prev_inicio: `${formatDateSP(prevStart)}T00:00:00-03:00`,
        prev_fim: `${formatDateSP(prevEnd)}T23:59:59-03:00`,
    }
}

// Extrair a data (YYYY-MM-DD) de uma string de timestamp do Supabase
// O Supabase retorna: "2026-03-02 12:00:23.391-03" (com espaço, não T)
export function extractDateSP(timestampStr: string): string {
    // Pega os primeiros 10 caracteres (YYYY-MM-DD) direto
    return timestampStr.substring(0, 10)
}

export function getFilters(url: URL) {
    return {
        campanha: url.searchParams.get('campanha') || '',
        anuncio: url.searchParams.get('anuncio') || '',
        produto: url.searchParams.get('produto') || '',
        pago: url.searchParams.get('pago') || '',
    }
}
