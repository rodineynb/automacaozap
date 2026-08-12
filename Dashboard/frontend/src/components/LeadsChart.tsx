import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, Bar, ComposedChart, Line } from 'recharts'
import { formatCurrency } from '../lib/utils'
import type { LeadPorDia } from '../types'

interface Props {
    data: LeadPorDia[]
    loading: boolean
}

// Formata data YYYY-MM-DD para DD/MM sem timezone (evita bug de -1 dia)
function formatDate(dateStr: string): string {
    const parts = dateStr.split('-')
    if (parts.length >= 3) return `${parts[2]}/${parts[1]}`
    return dateStr
}

export default function LeadsChart({ data, loading }: Props) {
    if (loading) {
        return (
            <div>
                <div className="skeleton w-48 h-5 mb-6" />
                <div className="skeleton w-full h-[340px]" />
            </div>
        )
    }

    if (data.length === 0) {
        return (
            <div className="text-center text-muted-foreground text-sm py-10">
                <p>Sem dados de leads no período selecionado.</p>
            </div>
        )
    }

    const formatted = data.map(d => ({
        ...d,
        dia: formatDate(d.dia),
    }))

    const totalFaturamento = data.reduce((sum, d) => sum + d.faturamento, 0)

    return (
        <div>
            <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
                <div>
                    <h3 className="text-sm font-bold">Leads & Faturamento por Dia</h3>
                    <p className="text-xs text-muted-foreground mt-1">
                        Faturamento total: <span className="text-primary-light font-semibold">{formatCurrency(totalFaturamento)}</span>
                    </p>
                </div>
                <div className="flex items-center gap-5 text-[10px]">
                    <div className="flex items-center gap-1.5">
                        <div className="w-2.5 h-2.5 rounded-full bg-[#2dd4bf]" />
                        <span className="text-muted-foreground">Total</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <div className="w-2.5 h-2.5 rounded-full bg-[#fb923c]" />
                        <span className="text-muted-foreground">Pagantes</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <div className="w-2.5 h-2.5 rounded-sm bg-[#38bdf8]/40" />
                        <span className="text-muted-foreground">R$</span>
                    </div>
                </div>
            </div>
            <ResponsiveContainer width="100%" height={340}>
                <ComposedChart data={formatted} margin={{ top: 5, right: 10, bottom: 5, left: -5 }}>
                    <defs>
                        <linearGradient id="gradLeads" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#2dd4bf" stopOpacity={0.25} />
                            <stop offset="100%" stopColor="#2dd4bf" stopOpacity={0} />
                        </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(45,212,191,0.06)" vertical={false} />
                    <XAxis dataKey="dia" stroke="#475569" fontSize={11} tickLine={false} axisLine={false} dy={8} />
                    <YAxis yAxisId="left" stroke="#475569" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis yAxisId="right" orientation="right" stroke="#475569" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v: number) => `R$${v}`} />
                    <Tooltip
                        contentStyle={{
                            backgroundColor: '#162030',
                            border: '1px solid rgba(45,212,191,0.2)',
                            borderRadius: '14px',
                            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                            padding: '14px 18px',
                        }}
                        labelStyle={{ color: '#e8edf2', fontWeight: 700, fontSize: 13, marginBottom: 8 }}
                        itemStyle={{ color: '#94a3b8', fontSize: 12, paddingTop: 2 }}
                        formatter={((value: any, name: any) => {
                            if (name === 'Faturamento') return [formatCurrency(Number(value) || 0), name]
                            return [value, name]
                        }) as any}
                    />
                    <Bar yAxisId="right" dataKey="faturamento" fill="rgba(56, 189, 248, 0.12)" stroke="#38bdf8" strokeWidth={1} radius={[6, 6, 0, 0]} name="Faturamento" barSize={28} />
                    <Area yAxisId="left" type="monotone" dataKey="total_leads" stroke="#2dd4bf" fill="url(#gradLeads)" strokeWidth={2.5} name="Total" dot={false} activeDot={{ r: 5, strokeWidth: 0, fill: '#2dd4bf' }} />
                    <Line yAxisId="left" type="monotone" dataKey="total_pagos" stroke="#fb923c" strokeWidth={2} name="Pagantes" dot={false} activeDot={{ r: 4, strokeWidth: 0, fill: '#fb923c' }} strokeDasharray="5 3" />
                </ComposedChart>
            </ResponsiveContainer>
        </div>
    )
}
