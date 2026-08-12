import { useState, useRef, useEffect } from 'react'
import type { FiltersState, Filtros } from '../types'
import { Calendar, SlidersHorizontal, RotateCcw, Search, ChevronDown, Check, X } from 'lucide-react'

interface Props {
    filters: FiltersState
    options: Filtros
    onFilterChange: <K extends keyof FiltersState>(key: K, value: FiltersState[K]) => void
    onDatePreset: (days: number) => void
    onReset: () => void
}

const DATE_PRESETS = [
    { label: 'Hoje', days: 0 },
    { label: 'Ontem', days: 1 },
    { label: '7D', days: 7 },
    { label: '14D', days: 14 },
    { label: '30D', days: 30 },
    { label: '60D', days: 60 },
]

function MultiSelect({ label, selected, options, onChange }: {
    label: string
    selected: string[]
    options: string[]
    onChange: (val: string[]) => void
}) {
    const [open, setOpen] = useState(false)
    const [search, setSearch] = useState('')
    const ref = useRef<HTMLDivElement>(null)

    useEffect(() => {
        function handleClick(e: MouseEvent) {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
        }
        document.addEventListener('mousedown', handleClick)
        return () => document.removeEventListener('mousedown', handleClick)
    }, [])

    const filtered = options.filter(o => o.toLowerCase().includes(search.toLowerCase()))

    const toggle = (item: string) => {
        if (selected.includes(item)) onChange(selected.filter(s => s !== item))
        else onChange([...selected, item])
    }

    return (
        <div ref={ref} className="relative w-full">
            <label className="text-[10px] font-semibold text-muted-foreground mb-1.5 block uppercase tracking-widest">{label}</label>
            <button
                onClick={() => setOpen(!open)}
                className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-accent/50 border border-border text-foreground hover:border-border-hover transition-colors text-left min-h-[36px]"
            >
                <span className="truncate text-xs">
                    {selected.length === 0 ? 'Todos' : `${selected.length} selecionado${selected.length > 1 ? 's' : ''}`}
                </span>
                <ChevronDown size={13} className={`text-muted-foreground transition-transform ml-1 flex-shrink-0 ${open ? 'rotate-180' : ''}`} />
            </button>

            {selected.length > 0 && (
                <button onClick={(e) => { e.stopPropagation(); onChange([]); }} className="absolute top-0 right-0 p-0.5 text-muted-foreground hover:text-foreground">
                    <X size={11} />
                </button>
            )}

            {open && (
                <div className="absolute z-50 mt-1.5 w-full min-w-[220px] rounded-lg bg-card border border-border shadow-2xl shadow-black/50 max-h-60 overflow-hidden">
                    <div className="p-2 border-b border-border">
                        <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-accent/50">
                            <Search size={12} className="text-muted-foreground flex-shrink-0" />
                            <input
                                type="text"
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                placeholder="Buscar..."
                                className="bg-transparent text-xs text-foreground outline-none flex-1 placeholder:text-muted-foreground"
                                autoFocus
                            />
                        </div>
                    </div>
                    <div className="overflow-y-auto max-h-44 p-1">
                        {filtered.length === 0 ? (
                            <p className="text-xs text-muted-foreground p-3 text-center">Nenhum resultado</p>
                        ) : (
                            filtered.map(item => (
                                <button
                                    key={item}
                                    onClick={() => toggle(item)}
                                    className="w-full flex items-center gap-2 px-2.5 py-2 text-xs rounded-md hover:bg-accent transition-colors text-left"
                                >
                                    <div className={`checkbox-custom ${selected.includes(item) ? 'checked' : ''}`}>
                                        {selected.includes(item) && <Check size={9} className="text-white" />}
                                    </div>
                                    <span className="truncate">{item}</span>
                                </button>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}

export default function Filters({ filters, options, onFilterChange, onDatePreset, onReset }: Props) {
    const activeDays = (() => {
        const start = new Date(filters.data_inicio)
        const end = new Date(filters.data_fim)
        const spFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' })
        const todaySP = spFormatter.format(new Date())

        if (end.toISOString().split('T')[0] !== todaySP) {
            // Check if it's "Ontem"
            const yesterday = new Date()
            yesterday.setDate(yesterday.getDate() - 1)
            const yesterdaySP = spFormatter.format(yesterday)
            if (end.toISOString().split('T')[0] === yesterdaySP && start.toISOString().split('T')[0] === yesterdaySP) {
                return 1
            }
            return -1
        }
        const diff = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
        return DATE_PRESETS.find(p => p.days === diff)?.days ?? -1
    })()

    const hasActiveFilters = filters.campanhas.length > 0 || filters.anuncios.length > 0 || filters.produto || filters.pago || filters.busca

    return (
        <div className="glass-card p-4 sm:p-5">
            {/* Período */}
            <div className="mb-4">
                <div className="flex items-center gap-2 mb-3">
                    <Calendar size={13} className="text-primary-light" />
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Período</span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <div className="flex flex-wrap gap-1">
                        {DATE_PRESETS.map(p => (
                            <button
                                key={p.days}
                                onClick={() => onDatePreset(p.days)}
                                className={`toggle-btn ${activeDays === p.days ? 'active' : ''}`}
                            >
                                {p.label}
                            </button>
                        ))}
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                        <input
                            type="date"
                            value={filters.data_inicio}
                            onChange={e => onFilterChange('data_inicio', e.target.value)}
                            className="px-2 py-1.5 rounded-lg bg-accent/50 border border-border text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40 w-[120px]"
                        />
                        <span className="text-[10px] text-muted-foreground">→</span>
                        <input
                            type="date"
                            value={filters.data_fim}
                            onChange={e => onFilterChange('data_fim', e.target.value)}
                            className="px-2 py-1.5 rounded-lg bg-accent/50 border border-border text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40 w-[120px]"
                        />
                    </div>
                </div>
            </div>

            <div className="section-divider" />

            {/* Filtros */}
            <div className="mt-4">
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                        <SlidersHorizontal size={13} className="text-primary-light" />
                        <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Filtros</span>
                    </div>
                    {hasActiveFilters && (
                        <button onClick={onReset} className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-muted-foreground hover:text-foreground transition-colors rounded-md hover:bg-accent">
                            <RotateCcw size={10} />
                            Limpar
                        </button>
                    )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <MultiSelect label="Campanha" selected={filters.campanhas} options={options.campanhas} onChange={val => onFilterChange('campanhas', val)} />
                    <MultiSelect label="Criativo" selected={filters.anuncios} options={options.anuncios} onChange={val => onFilterChange('anuncios', val)} />

                    <div>
                        <label className="text-[10px] font-semibold text-muted-foreground mb-1.5 block uppercase tracking-widest">Produto</label>
                        <select
                            value={filters.produto}
                            onChange={e => onFilterChange('produto', e.target.value)}
                            className="w-full px-3 py-2 rounded-lg bg-accent/50 border border-border text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40 min-h-[36px]"
                        >
                            <option value="">Todos</option>
                            {options.produtos.map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                    </div>

                    <div>
                        <label className="text-[10px] font-semibold text-muted-foreground mb-1.5 block uppercase tracking-widest">Status</label>
                        <div className="flex gap-1">
                            {[
                                { label: 'Todos', value: '' },
                                { label: 'Pagos', value: 'true' },
                                { label: 'Não pagos', value: 'false' },
                            ].map(opt => (
                                <button key={opt.value} onClick={() => onFilterChange('pago', opt.value)} className={`toggle-btn flex-1 ${filters.pago === opt.value ? 'active' : ''}`}>
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
