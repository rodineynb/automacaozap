import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { formatCurrency } from './dashboard-utils'
import type { Campanha } from '../../types/dashboard'

interface Props {
    data: Campanha[]
    loading: boolean
}

const COLORS = ['#2dd4bf', '#38bdf8', '#fb923c', '#34d399', '#a78bfa', '#f472b6', '#fbbf24']

export default function CampanhasChart({ data, loading }: Props) {
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
                <p>Sem dados de campanhas no período selecionado.</p>
            </div>
        )
    }

    const totalFaturamento = data.reduce((sum, d) => sum + d.faturamento, 0)

    return (
        <div>
            <div className="mb-6">
                <h3 className="text-sm font-bold">Campanhas</h3>
                <p className="text-xs text-muted-foreground mt-1">
                    Faturamento: <span className="text-primary-light font-semibold">{formatCurrency(totalFaturamento)}</span>
                </p>
            </div>

            <ResponsiveContainer width="100%" height={220}>
                <BarChart data={data} margin={{ top: 0, right: 10, bottom: 5, left: -5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(45,212,191,0.06)" vertical={false} />
                    <XAxis dataKey="campanha" stroke="#475569" fontSize={9} tickLine={false} axisLine={false} interval={0} angle={-15} textAnchor="end" height={45} />
                    <YAxis stroke="#475569" fontSize={10} tickLine={false} axisLine={false} />
                    <Tooltip
                        contentStyle={{ backgroundColor: '#162030', border: '1px solid rgba(45,212,191,0.2)', borderRadius: '14px', boxShadow: '0 8px 32px rgba(0,0,0,0.5)', padding: '14px 18px' }}
                        labelStyle={{ color: '#e8edf2', fontWeight: 700, fontSize: 13, marginBottom: 8 }}
                        formatter={((value: any, name: any) => {
                            if (name === 'Faturamento') return [formatCurrency(Number(value) || 0), name]
                            return [value, name]
                        }) as any}
                    />
                    <Bar dataKey="total_leads" name="Leads" radius={[4, 4, 0, 0]} barSize={18} fill="rgba(45, 212, 191, 0.4)" stroke="#2dd4bf" />
                    <Bar dataKey="total_pagos" name="Pagos" radius={[4, 4, 0, 0]} barSize={18} fill="rgba(52, 211, 153, 0.4)" stroke="#34d399" />
                </BarChart>
            </ResponsiveContainer>

            {/* Detalhes */}
            <div className="mt-5 space-y-2.5 max-h-[180px] overflow-y-auto pr-1">
                {data.map((c, i) => (
                    <div key={c.campanha} className="flex items-center justify-between p-3 rounded-xl hover:bg-accent/30 transition-colors border border-transparent hover:border-border">
                        <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                            <span className="text-xs truncate">{c.campanha}</span>
                        </div>
                        <div className="flex items-center gap-4 flex-shrink-0">
                            <span className="text-[10px] text-muted-foreground">{c.total_leads} leads</span>
                            <span className="text-[10px] text-muted-foreground">{c.total_pagos} vendas</span>
                            <span className="text-xs font-bold text-success">{formatCurrency(c.faturamento)}</span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}
