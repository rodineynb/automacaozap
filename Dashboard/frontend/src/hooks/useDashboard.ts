import { useState, useEffect, useCallback } from 'react'
import { api } from '../lib/api'
import { getDefaultDateRange } from '../lib/utils'
import type { FiltersState, Filtros, Metrics, Criativo, LeadPorDia, Campanha, Funil, LeadsResponse } from '../types'

const defaultRange = getDefaultDateRange()

const defaultFilters: FiltersState = {
    data_inicio: defaultRange.data_inicio,
    data_fim: defaultRange.data_fim,
    campanhas: [],
    anuncios: [],
    produto: '',
    pago: '',
    busca: '',
}

export function useFilters() {
    const [filters, setFilters] = useState<FiltersState>(defaultFilters)
    const [options, setOptions] = useState<Filtros>({ campanhas: [], anuncios: [], produtos: [] })

    useEffect(() => {
        api.getFiltros().then(setOptions).catch(console.error)
    }, [])

    const updateFilter = useCallback(<K extends keyof FiltersState>(key: K, value: FiltersState[K]) => {
        setFilters(prev => ({ ...prev, [key]: value }))
    }, [])

    const setDatePreset = useCallback((days: number) => {
        const spFormatter = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'America/Sao_Paulo',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
        })

        const now = new Date()
        const todaySP = spFormatter.format(now)

        if (days === 0) {
            // Hoje
            setFilters(prev => ({ ...prev, data_inicio: todaySP, data_fim: todaySP }))
        } else if (days === 1) {
            // Ontem
            const yesterday = new Date()
            yesterday.setDate(yesterday.getDate() - 1)
            const yesterdaySP = spFormatter.format(yesterday)
            setFilters(prev => ({ ...prev, data_inicio: yesterdaySP, data_fim: yesterdaySP }))
        } else {
            const start = new Date()
            start.setDate(start.getDate() - days)
            const startSP = spFormatter.format(start)
            setFilters(prev => ({ ...prev, data_inicio: startSP, data_fim: todaySP }))
        }
    }, [])

    const resetFilters = useCallback(() => {
        setFilters(defaultFilters)
    }, [])

    return { filters, options, updateFilter, setDatePreset, resetFilters }
}

export function useDashboardData(filters: FiltersState) {
    const [metrics, setMetrics] = useState<Metrics | null>(null)
    const [criativos, setCriativos] = useState<Criativo[]>([])
    const [leadsPorDia, setLeadsPorDia] = useState<LeadPorDia[]>([])
    const [campanhas, setCampanhas] = useState<Campanha[]>([])
    const [funil, setFunil] = useState<Funil | null>(null)
    const [leads, setLeads] = useState<LeadsResponse | null>(null)
    const [loading, setLoading] = useState(true)
    const [page, setPage] = useState(1)

    const fetchAll = useCallback(async () => {
        setLoading(true)
        try {
            const [m, cr, l, camp, f, ld] = await Promise.all([
                api.getMetrics(filters),
                api.getCriativos(filters),
                api.getLeadsPorDia(filters),
                api.getCampanhas(filters),
                api.getFunil(filters),
                api.getLeads(filters, page),
            ])
            setMetrics(m)
            setCriativos(cr)
            setLeadsPorDia(l)
            setCampanhas(camp)
            setFunil(f)
            setLeads(ld)
        } catch (err) {
            console.error('Erro ao carregar dados:', err)
        } finally {
            setLoading(false)
        }
    }, [filters, page])

    useEffect(() => {
        fetchAll()
    }, [fetchAll])

    return { metrics, criativos, leadsPorDia, campanhas, funil, leads, loading, page, setPage, refresh: fetchAll }
}
