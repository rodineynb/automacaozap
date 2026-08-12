import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { formatCurrency } from '../lib/utils'
import type { Criativo } from '../types'

interface Props {
    data: Criativo[]
    loading: boolean
}

const COLORS = ['#2dd4bf', '#38bdf8', '#fb923c', '#34d399', '#a78bfa', '#f472b6', '#fbbf24', '#22d3ee']

export default function CriativosChart({ data, loading }: Props) {
    if (loading) {
        return (
            <div>
                <div className="skeleton w-48 h-5 mb-6" />
                <div className="skeleton w-full h-[300px]" />
            </div>
        )
    }

    if (data.length === 0) {
        return (
            <div className="text-center text-muted-foreground text-sm py-10">
                <p>Sem dados de criativos no período selecionado.</p>
            </div>
        )
    }

    const top10 = data.slice(0, 10)
    const totalFaturamento = data.reduce((sum, d) => sum + d.faturamento, 0)

    return (
        <div>
            <div className="mb-6">
                <h3 className="text-sm font-bold">Ranking de Criativos</h3>
                <p className="text-xs text-muted-foreground mt-1">
                    Faturamento total: <span className="text-primary-light font-semibold">{formatCurrency(totalFaturamento)}</span>
                </p>
            </div>

            <ResponsiveContainer width="100%" height={220}>
                <BarChart data={top10} layout="vertical" margin={{ top: 0, right: 10, bottom: 0, left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(45,212,191,0.06)" horizontal={false} />
                    <XAxis type="number" stroke="#475569" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v: number) => `R$${v}`} />
                    <YAxis dataKey="anuncio" type="category" stroke="#475569" fontSize={9} tickLine={false} axisLine={false} width={80} />
                    <Tooltip
                        contentStyle={{ backgroundColor: '#162030', border: '1px solid rgba(45,212,191,0.2)', borderRadius: '14px', boxShadow: '0 8px 32px rgba(0,0,0,0.5)', padding: '14px 18px' }}
                        labelStyle={{ color: '#e8edf2', fontWeight: 700, fontSize: 13, marginBottom: 8 }}
                        formatter={((value: any, name: any) => {
                            if (name === 'Faturamento') return [formatCurrency(Number(value) || 0), name]
                            return [value, name]
                        }) as any}
                    />
                    <Bar dataKey="faturamento" name="Faturamento" radius={[0, 6, 6, 0]} barSize={16}>
                        {top10.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} fillOpacity={0.7} />)}
                    </Bar>
                </BarChart>
            </ResponsiveContainer>

            {/* Detalhes por criativo */}
            <div className="mt-5 space-y-2.5 max-h-[220px] overflow-y-auto pr-1">
                {top10.map((c, i) => (
                    <div key={c.anuncio} className="flex items-start gap-3 p-3 rounded-xl hover:bg-accent/30 transition-colors border border-transparent hover:border-border">
                        <div className="w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-medium truncate">{c.anuncio}</span>
                                <span className="text-xs font-bold text-success whitespace-nowrap">{formatCurrency(c.faturamento)}</span>
                            </div>
                            <div className="flex items-center gap-4 mt-1">
                                <span className="text-[10px] text-muted-foreground">{c.total_leads} leads</span>
                                <span className="text-[10px] text-muted-foreground">{c.total_vendas} vendas</span>
                                <span className="text-[10px] text-muted-foreground">{c.taxa_conversao}% conv.</span>
                            </div>
                            {c.valores_detalhados && c.valores_detalhados.length > 0 && (
                                <div className="flex flex-wrap gap-1.5 mt-1.5">
                                    {c.valores_detalhados.map((v, vi) => (
                                        <span key={vi} className="badge badge-teal text-[9px]">
                                            {v.quantidade}x {formatCurrency(v.valor)}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}
