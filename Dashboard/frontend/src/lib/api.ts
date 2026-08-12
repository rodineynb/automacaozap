import type { Metrics, Criativo, LeadPorDia, Campanha, Funil, LeadsResponse, Filtros, FiltersState, Analytics } from '../types'

const API_BASE = import.meta.env.VITE_API_URL || 'https://dashboard-leads-api.projetobrlatam.workers.dev'

function buildParams(filters: FiltersState): URLSearchParams {
    const params = new URLSearchParams()
    if (filters.data_inicio) params.set('data_inicio', filters.data_inicio)
    if (filters.data_fim) params.set('data_fim', filters.data_fim)
    if (filters.campanhas.length > 0) params.set('campanha', filters.campanhas.join(','))
    if (filters.anuncios.length > 0) params.set('anuncio', filters.anuncios.join(','))
    if (filters.produto) params.set('produto', filters.produto)
    if (filters.pago) params.set('pago', filters.pago)
    if (filters.busca) params.set('busca', filters.busca)
    return params
}

async function fetchAPI<T>(path: string, filters?: FiltersState): Promise<T> {
    const params = filters ? buildParams(filters) : new URLSearchParams()
    const url = `${API_BASE}${path}?${params.toString()}`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`API error: ${res.status}`)
    return res.json()
}

export const api = {
    getMetrics: (filters: FiltersState) => fetchAPI<Metrics>('/api/metrics', filters),
    getCriativos: (filters: FiltersState) => fetchAPI<Criativo[]>('/api/criativos', filters),
    getLeadsPorDia: (filters: FiltersState) => fetchAPI<LeadPorDia[]>('/api/leads-por-dia', filters),
    getCampanhas: (filters: FiltersState) => fetchAPI<Campanha[]>('/api/campanhas', filters),
    getFunil: (filters: FiltersState) => fetchAPI<Funil>('/api/funil', filters),
    getLeads: (filters: FiltersState, page = 1) => {
        const params = buildParams(filters)
        params.set('page', String(page))
        const url = `${API_BASE}/api/leads?${params.toString()}`
        return fetch(url).then(r => { if (!r.ok) throw new Error(`API error: ${r.status}`); return r.json() as Promise<LeadsResponse> })
    },
    getFiltros: () => fetchAPI<Filtros>('/api/filtros'),
    getAnalytics: (filters: FiltersState) => fetchAPI<Analytics>('/api/analytics', filters),
}
