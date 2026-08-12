import { useState, useMemo } from 'react'
import type { Lead, LeadsResponse } from '../types'
import { formatDateTime, formatCurrency } from '../lib/utils'
import { ChevronLeft, ChevronRight, Download, Search, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react'

interface Props {
    data: LeadsResponse | null
    loading: boolean
    page: number
    onPageChange: (page: number) => void
}

type SortKey = 'nome' | 'telefone' | 'produto' | 'campanha' | 'created_at' | 'pago' | 'data_pagamento'
type SortDir = 'asc' | 'desc'

function exportCSV(leads: Lead[]) {
    const headers = ['Nome', 'Telefone', 'Produto', 'Campanha', 'Criativo', 'Data', 'Pagou', 'Valor Pgto', 'Data Pgto']
    const rows = leads.map(l => [
        l.nome, l.telefone, l.produto, l.campanha || '', l.anuncio || '',
        formatDateTime(l.created_at), l.pago ? 'Sim' : 'Não',
        l.valor_pagamento != null ? String(l.valor_pagamento) : '',
        l.data_pagamento ? formatDateTime(l.data_pagamento) : ''
    ])
    const csv = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `leads_${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
}

export default function LeadsTable({ data, loading, page, onPageChange }: Props) {
    const [search, setSearch] = useState('')
    const [sortKey, setSortKey] = useState<SortKey>('created_at')
    const [sortDir, setSortDir] = useState<SortDir>('desc')

    const toggleSort = (key: SortKey) => {
        if (sortKey === key) {
            setSortDir(d => d === 'asc' ? 'desc' : 'asc')
        } else {
            setSortKey(key)
            setSortDir('desc')
        }
    }

    const SortIcon = ({ col }: { col: SortKey }) => {
        if (sortKey !== col) return <ArrowUpDown size={12} className="text-muted-foreground/40" />
        return sortDir === 'asc' ? <ArrowUp size={12} className="text-primary" /> : <ArrowDown size={12} className="text-primary" />
    }

    const filtered = useMemo(() => {
        if (!data?.data) return []
        let list = [...data.data]

        if (search) {
            const s = search.toLowerCase()
            list = list.filter(l =>
                (l.nome || '').toLowerCase().includes(s) ||
                (l.telefone || '').includes(s) ||
                (l.produto || '').toLowerCase().includes(s) ||
                (l.campanha || '').toLowerCase().includes(s) ||
                (l.anuncio || '').toLowerCase().includes(s)
            )
        }

        list.sort((a, b) => {
            const av = a[sortKey] ?? ''
            const bv = b[sortKey] ?? ''
            if (typeof av === 'boolean') return sortDir === 'asc' ? (av ? 1 : -1) : (av ? -1 : 1)
            if (av < bv) return sortDir === 'asc' ? -1 : 1
            if (av > bv) return sortDir === 'asc' ? 1 : -1
            return 0
        })

        return list
    }, [data, search, sortKey, sortDir])

    if (loading) {
        return (
            <div>
                <div className="skeleton w-40 h-5 mb-6" />
                <div className="space-y-2">
                    {Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton w-full h-11" />)}
                </div>
            </div>
        )
    }

    if (!data || data.data.length === 0) {
        return (
            <div className="text-center text-muted-foreground text-sm py-6">
                Nenhum lead encontrado no período selecionado.
            </div>
        )
    }

    const totalPages = Math.ceil(data.total / data.per_page)

    return (
        <div className="overflow-hidden">
            {/* Header da tabela */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-4 gap-3">
                <div>
                    <h3 className="text-sm font-semibold">Leads Detalhados</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">{data.total} leads encontrados • horário de SP (UTC-3)</p>
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-secondary border border-border flex-1 sm:flex-initial">
                        <Search size={13} className="text-muted-foreground flex-shrink-0" />
                        <input
                            type="text"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Buscar nome, telefone..."
                            className="bg-transparent text-xs text-foreground outline-none w-full sm:w-40 placeholder:text-muted-foreground"
                        />
                    </div>
                    <button
                        onClick={() => exportCSV(filtered)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary border border-border text-xs font-medium hover:bg-accent hover:border-border-hover transition-colors flex-shrink-0"
                    >
                        <Download size={13} />
                        CSV
                    </button>
                </div>
            </div>

            {/* Tabela com scroll horizontal no mobile */}
            <div className="overflow-x-auto -mx-0">
                <table className="w-full text-sm min-w-[900px]">
                    <thead>
                        <tr className="border-t border-border bg-muted/20">
                            <th onClick={() => toggleSort('nome')} className="py-2.5 px-3 sm:px-4 font-medium text-[11px] uppercase tracking-wider text-muted-foreground cursor-pointer hover:text-foreground transition-colors select-none text-left">
                                <span className="inline-flex items-center gap-1">Nome <SortIcon col="nome" /></span>
                            </th>
                            <th onClick={() => toggleSort('telefone')} className="py-2.5 px-3 sm:px-4 font-medium text-[11px] uppercase tracking-wider text-muted-foreground cursor-pointer hover:text-foreground transition-colors select-none text-left">
                                <span className="inline-flex items-center gap-1">Telefone <SortIcon col="telefone" /></span>
                            </th>
                            <th onClick={() => toggleSort('produto')} className="py-2.5 px-3 sm:px-4 font-medium text-[11px] uppercase tracking-wider text-muted-foreground cursor-pointer hover:text-foreground transition-colors select-none text-left">
                                <span className="inline-flex items-center gap-1">Produto <SortIcon col="produto" /></span>
                            </th>
                            <th onClick={() => toggleSort('campanha')} className="py-2.5 px-3 sm:px-4 font-medium text-[11px] uppercase tracking-wider text-muted-foreground cursor-pointer hover:text-foreground transition-colors select-none text-left">
                                <span className="inline-flex items-center gap-1">Campanha <SortIcon col="campanha" /></span>
                            </th>
                            <th onClick={() => toggleSort('created_at')} className="py-2.5 px-3 sm:px-4 font-medium text-[11px] uppercase tracking-wider text-muted-foreground cursor-pointer hover:text-foreground transition-colors select-none text-left">
                                <span className="inline-flex items-center gap-1">Data <SortIcon col="created_at" /></span>
                            </th>
                            <th onClick={() => toggleSort('pago')} className="py-2.5 px-3 sm:px-4 font-medium text-[11px] uppercase tracking-wider text-muted-foreground cursor-pointer hover:text-foreground transition-colors select-none text-center">
                                <span className="inline-flex items-center gap-1">Status <SortIcon col="pago" /></span>
                            </th>
                            <th className="py-2.5 px-3 sm:px-4 font-medium text-[11px] uppercase tracking-wider text-muted-foreground text-right">Valor</th>
                            <th onClick={() => toggleSort('data_pagamento')} className="py-2.5 px-3 sm:px-4 font-medium text-[11px] uppercase tracking-wider text-muted-foreground cursor-pointer hover:text-foreground transition-colors select-none text-left">
                                <span className="inline-flex items-center gap-1">Data Pgto <SortIcon col="data_pagamento" /></span>
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.map((lead, i) => (
                            <tr key={i} className="border-t border-border/40 hover:bg-accent/30 transition-colors">
                                <td className="py-2.5 px-3 sm:px-4 text-xs font-medium whitespace-nowrap">{lead.nome || '—'}</td>
                                <td className="py-2.5 px-3 sm:px-4 text-xs text-muted-foreground font-mono whitespace-nowrap">{lead.telefone}</td>
                                <td className="py-2.5 px-3 sm:px-4 text-xs whitespace-nowrap">{lead.produto || '—'}</td>
                                <td className="py-2.5 px-3 sm:px-4 text-xs text-muted-foreground max-w-[160px] truncate">{lead.campanha || '—'}</td>
                                <td className="py-2.5 px-3 sm:px-4 text-xs text-muted-foreground whitespace-nowrap">{formatDateTime(lead.created_at)}</td>
                                <td className="py-2.5 px-3 sm:px-4 text-center">
                                    <span className={`badge ${lead.pago ? 'badge-success' : 'badge-danger'}`}>
                                        {lead.pago ? '✓ Pago' : '✗ Não'}
                                    </span>
                                </td>
                                <td className="py-2.5 px-3 sm:px-4 text-xs text-right font-mono whitespace-nowrap">
                                    {lead.valor_pagamento != null ? formatCurrency(lead.valor_pagamento) : '—'}
                                </td>
                                <td className="py-2.5 px-3 sm:px-4 text-xs text-muted-foreground whitespace-nowrap">
                                    {lead.data_pagamento ? formatDateTime(lead.data_pagamento) : '—'}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Paginação */}
            <div className="flex flex-col sm:flex-row items-center justify-between p-4 border-t border-border gap-2">
                <span className="text-xs text-muted-foreground">
                    Página {page} de {totalPages}
                </span>
                <div className="flex items-center gap-1 flex-wrap justify-center">
                    <button
                        onClick={() => onPageChange(page - 1)}
                        disabled={page <= 1}
                        className="p-1.5 rounded-md hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                        <ChevronLeft size={14} />
                    </button>
                    {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                        const p = Math.max(1, Math.min(page - 2, totalPages - 4)) + i
                        if (p > totalPages) return null
                        return (
                            <button
                                key={p}
                                onClick={() => onPageChange(p)}
                                className={`w-7 h-7 rounded-md text-xs font-medium transition-colors ${p === page ? 'bg-primary text-white' : 'hover:bg-accent'}`}
                            >
                                {p}
                            </button>
                        )
                    })}
                    <button
                        onClick={() => onPageChange(page + 1)}
                        disabled={page >= totalPages}
                        className="p-1.5 rounded-md hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                        <ChevronRight size={14} />
                    </button>
                </div>
            </div>
        </div>
    )
}
