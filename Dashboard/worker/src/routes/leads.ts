import { Hono } from 'hono'
import { getSupabase, getDateRange, getFilters, fetchAll, type Env } from '../lib/supabase'

const leads = new Hono<{ Bindings: Env }>()

leads.get('/', async (c) => {
    const supabase = getSupabase(c.env)
    const url = new URL(c.req.url)
    const { data_inicio, data_fim } = getDateRange(url)
    const filters = getFilters(url)
    const busca = url.searchParams.get('busca') || ''
    const page = parseInt(url.searchParams.get('page') || '1')
    const per_page = 50
    const from = (page - 1) * per_page
    const to = from + per_page - 1

    // Se tem filtro de campanha ou anuncio, precisamos pré-filtrar telefones via tracking
    let telefonesFiltrados: string[] | null = null

    if (filters.campanha || filters.anuncio) {
        const trackFilters: { column: string; op: string; value: any }[] = []
        if (filters.campanha) trackFilters.push({ column: 'campanha', op: 'eq', value: filters.campanha })
        if (filters.anuncio) trackFilters.push({ column: 'anuncio', op: 'eq', value: filters.anuncio })

        const trackData = await fetchAll(supabase, 'tracking_zap_face', 'telefone', trackFilters.length > 0 ? trackFilters : undefined)
        telefonesFiltrados = trackData.map(t => t.telefone).filter(Boolean)

        // Se nenhum telefone encontrado, retornar vazio
        if (telefonesFiltrados.length === 0) {
            return c.json({ data: [], total: 0, page, per_page })
        }
    }

    // Query principal de leads
    let countQuery = supabase
        .from('bd_recheios_followup')
        .select('telefone', { count: 'exact', head: true })
        .gte('created_at', data_inicio)
        .lte('created_at', data_fim)

    let query = supabase
        .from('bd_recheios_followup')
        .select('nome, telefone, session_id, produto, pago, valor_pagamento, data_pagamento, clicou_url, created_at')
        .gte('created_at', data_inicio)
        .lte('created_at', data_fim)
        .order('created_at', { ascending: false })

    // Aplicar filtros
    if (filters.produto) {
        query = query.eq('produto', filters.produto)
        countQuery = countQuery.eq('produto', filters.produto)
    }
    if (filters.pago === 'true') {
        query = query.eq('pago', true)
        countQuery = countQuery.eq('pago', true)
    }
    if (filters.pago === 'false') {
        query = query.eq('pago', false)
        countQuery = countQuery.eq('pago', false)
    }

    // Filtro por busca (nome ou telefone)
    if (busca) {
        const buscaFilter = `nome.ilike.%${busca}%,telefone.ilike.%${busca}%`
        query = query.or(buscaFilter)
        countQuery = countQuery.or(buscaFilter)
    }

    // Filtro por telefones (campanha/anuncio pré-filtrado via tracking)
    if (telefonesFiltrados !== null) {
        query = query.or(`telefone.in.(${telefonesFiltrados.join(',')}),session_id.in.(${telefonesFiltrados.join(',')})`)
        countQuery = countQuery.or(`telefone.in.(${telefonesFiltrados.join(',')}),session_id.in.(${telefonesFiltrados.join(',')})`)
    }

    // Paginação
    query = query.range(from, to)

    // Executar em paralelo
    const [{ data, error }, { count }] = await Promise.all([query, countQuery])
    if (error) return c.json({ error: error.message }, 500)

    // Buscar tracking para enriquecer leads com campanha/anuncio
    const telefonesResult = (data || []).map(d => d.telefone || d.session_id).filter(Boolean)
    let trackMap = new Map<string, { campanha: string | null; anuncio: string | null }>()

    if (telefonesResult.length > 0) {
        const { data: tracking } = await supabase
            .from('tracking_zap_face')
            .select('telefone, campanha, anuncio')
            .in('telefone', telefonesResult)

        for (const t of tracking || []) {
            if (t.telefone) {
                trackMap.set(t.telefone, { campanha: t.campanha, anuncio: t.anuncio })
            }
        }
    }

    const result = (data || []).map(lead => {
        const tel = lead.telefone || lead.session_id
        const track = tel ? trackMap.get(tel) : null
        return {
            ...lead,
            telefone: tel || lead.telefone,
            campanha: track?.campanha || null,
            anuncio: track?.anuncio || null,
        }
    })

    return c.json({
        data: result,
        total: count || 0,
        page,
        per_page,
    })
})

export default leads
