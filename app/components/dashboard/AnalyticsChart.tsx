import type { Analytics } from '../../types/dashboard'
import { Clock, Timer, TrendingUp, BarChart3, Flame } from 'lucide-react'

interface Props {
    data: Analytics | null
    loading: boolean
}

function formatTime(minutes: number): string {
    if (minutes < 1) return '< 1min'
    if (minutes < 60) return `${Math.round(minutes)}min`
    const h = Math.floor(minutes / 60)
    const m = Math.round(minutes % 60)
    return m > 0 ? `${h}h ${m}min` : `${h}h`
}

export default function AnalyticsChart({ data, loading }: Props) {
    if (loading) {
        return (
            <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {[1, 2, 3].map(i => (
                        <div key={i} className="glass-card rounded-2xl animate-pulse" style={{ padding: '14px 16px', height: 120 }} />
                    ))}
                </div>
                <div className="glass-card rounded-2xl animate-pulse" style={{ padding: '14px 16px', height: 300 }} />
                <div className="glass-card rounded-2xl animate-pulse" style={{ padding: '14px 16px', height: 300 }} />
            </div>
        )
    }

    if (!data || data.total_pagos === 0) {
        return (
            <div className="glass-card rounded-2xl flex items-center justify-center" style={{ padding: '14px 16px', minHeight: 200 }}>
                <p className="text-muted-foreground text-sm">Sem dados de compra no período selecionado</p>
            </div>
        )
    }

    const maxFaixa = Math.max(...data.faixas.map(f => f.quantidade))
    const maxHora = Math.max(...data.horas_quentes.map(h => h.quantidade))

    return (
        <div className="space-y-6">
            {/* ═══ TOP CARDS ═══ */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Tempo Médio */}
                <div className="glass-card rounded-2xl" style={{ padding: '14px 16px' }}>
                    <div className="flex items-center gap-3 mb-3">
                        <div className="p-2.5 rounded-xl bg-gradient-to-br from-blue-500/20 to-blue-600/10 border border-blue-500/15">
                            <Timer size={18} className="text-blue-400" />
                        </div>
                        <div>
                            <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Tempo Médio</p>
                            <p className="text-xl font-bold text-foreground">{formatTime(data.tempo_medio_minutos)}</p>
                        </div>
                    </div>
                    <p className="text-[10px] text-muted-foreground">Média de tempo entre lead entrar e pagar</p>
                </div>

                {/* Mediana */}
                <div className="glass-card rounded-2xl" style={{ padding: '14px 16px' }}>
                    <div className="flex items-center gap-3 mb-3">
                        <div className="p-2.5 rounded-xl bg-gradient-to-br from-purple-500/20 to-purple-600/10 border border-purple-500/15">
                            <Clock size={18} className="text-purple-400" />
                        </div>
                        <div>
                            <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Mediana</p>
                            <p className="text-xl font-bold text-foreground">{formatTime(data.tempo_mediana_minutos)}</p>
                        </div>
                    </div>
                    <p className="text-[10px] text-muted-foreground">50% dos clientes compraram até esse tempo</p>
                </div>

                {/* Total Pagos */}
                <div className="glass-card rounded-2xl" style={{ padding: '14px 16px' }}>
                    <div className="flex items-center gap-3 mb-3">
                        <div className="p-2.5 rounded-xl bg-gradient-to-br from-emerald-500/20 to-emerald-600/10 border border-emerald-500/15">
                            <TrendingUp size={18} className="text-emerald-400" />
                        </div>
                        <div>
                            <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Total Pagos</p>
                            <p className="text-xl font-bold text-foreground">{data.total_pagos}</p>
                        </div>
                    </div>
                    <p className="text-[10px] text-muted-foreground">Compradores analisados no período</p>
                </div>
            </div>

            {/* ═══ TIME DISTRIBUTION ═══ */}
            <div className="glass-card rounded-2xl" style={{ padding: '14px 16px' }}>
                <div className="flex items-center gap-2.5 mb-5">
                    <div className="p-2 rounded-lg bg-gradient-to-br from-amber-500/20 to-amber-600/10 border border-amber-500/15">
                        <BarChart3 size={16} className="text-amber-400" />
                    </div>
                    <div>
                        <h3 className="text-sm font-semibold text-foreground">Distribuição por Tempo de Compra</h3>
                        <p className="text-[10px] text-muted-foreground">% dos compradores por faixa de tempo</p>
                    </div>
                </div>

                <div className="space-y-3">
                    {data.faixas.map((faixa, i) => (
                        <div key={i} className="group">
                            <div className="flex items-center justify-between mb-1.5">
                                <span className="text-xs text-foreground font-medium">{faixa.label}</span>
                                <div className="flex items-center gap-2">
                                    <span className="text-xs font-bold text-foreground">{faixa.quantidade}</span>
                                    <span className="text-[10px] text-muted-foreground">({faixa.percentual}%)</span>
                                </div>
                            </div>
                            <div className="w-full h-7 rounded-lg bg-accent/30 overflow-hidden relative">
                                <div
                                    className="h-full rounded-lg transition-all duration-700 ease-out relative overflow-hidden"
                                    style={{
                                        width: `${maxFaixa > 0 ? (faixa.quantidade / maxFaixa) * 100 : 0}%`,
                                        minWidth: faixa.quantidade > 0 ? '8px' : '0',
                                        background: `linear-gradient(90deg, 
                                            hsl(${180 - i * 20}, 70%, 45%) 0%, 
                                            hsl(${180 - i * 20}, 70%, 55%) 100%)`
                                    }}
                                >
                                    <div
                                        className="absolute inset-0 opacity-20"
                                        style={{
                                            background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.3) 50%, transparent 100%)',
                                        }}
                                    />
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Acumulado */}
                <div className="mt-5 pt-4 border-t border-border/50">
                    <p className="text-[11px] text-muted-foreground mb-2">Acumulado</p>
                    <div className="flex flex-wrap gap-3">
                        {(() => {
                            let acumulado = 0
                            return data.faixas.map((faixa, i) => {
                                acumulado += faixa.percentual
                                if (acumulado > 100) acumulado = 100
                                return (
                                    <div key={i} className="text-center">
                                        <p className="text-sm font-bold text-foreground">{Math.round(acumulado)}%</p>
                                        <p className="text-[9px] text-muted-foreground">{faixa.label}</p>
                                    </div>
                                )
                            })
                        })()}
                    </div>
                </div>
            </div>

            {/* ═══ HORAS QUENTES ═══ */}
            <div className="glass-card rounded-2xl" style={{ padding: '14px 16px', overflow: 'hidden' }}>
                <div className="flex items-center gap-2.5 mb-5">
                    <div className="p-2 rounded-lg bg-gradient-to-br from-rose-500/20 to-rose-600/10 border border-rose-500/15">
                        <Flame size={16} className="text-rose-400" />
                    </div>
                    <div>
                        <h3 className="text-sm font-semibold text-foreground">Horas Quentes de Compra</h3>
                        <p className="text-[10px] text-muted-foreground">Horários do dia com mais compras (hora SP)</p>
                    </div>
                </div>

                {/* Bar chart container */}
                <div style={{ overflowX: 'auto', paddingBottom: '4px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(24, 1fr)', gap: '2px', minWidth: '480px' }}>
                        {data.horas_quentes.map((hora) => {
                            const height = maxHora > 0 ? (hora.quantidade / maxHora) * 100 : 0
                            const intensity = maxHora > 0 ? hora.quantidade / maxHora : 0

                            const bg = intensity > 0.7
                                ? 'linear-gradient(180deg, hsl(0, 80%, 55%) 0%, hsl(0, 70%, 45%) 100%)'
                                : intensity > 0.4
                                    ? 'linear-gradient(180deg, hsl(30, 80%, 55%) 0%, hsl(30, 70%, 45%) 100%)'
                                    : intensity > 0
                                        ? 'linear-gradient(180deg, hsl(180, 60%, 50%) 0%, hsl(180, 50%, 40%) 100%)'
                                        : 'transparent'

                            return (
                                <div key={hora.hora} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                    {/* Bar area with count on top */}
                                    <div style={{ width: '100%', height: '140px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', position: 'relative' }} className="group">
                                        {/* Tooltip on hover */}
                                        <div className="absolute -top-6 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-card border border-border rounded-lg px-2 py-1 shadow-lg z-10 whitespace-nowrap pointer-events-none">
                                            <p className="text-[10px] font-semibold text-foreground">{hora.quantidade} compras</p>
                                            <p className="text-[9px] text-muted-foreground">{hora.percentual}%</p>
                                        </div>
                                        {/* Count above bar */}
                                        {hora.quantidade > 0 && (
                                            <span style={{ fontSize: '8px', color: 'var(--muted-foreground)', marginBottom: '2px', lineHeight: 1 }}>
                                                {hora.quantidade}
                                            </span>
                                        )}
                                        {/* Bar */}
                                        <div
                                            style={{
                                                width: '100%',
                                                maxWidth: '20px',
                                                height: `${Math.max(height, hora.quantidade > 0 ? 4 : 0)}%`,
                                                minHeight: hora.quantidade > 0 ? '4px' : '0',
                                                background: bg,
                                                borderRadius: '3px 3px 0 0',
                                                cursor: 'pointer',
                                                transition: 'all 0.5s ease-out',
                                            }}
                                            className="hover:opacity-80"
                                        />
                                    </div>
                                    {/* Hour label */}
                                    <span style={{ fontSize: '8px', color: 'var(--muted-foreground)', marginTop: '3px', lineHeight: 1 }}>
                                        {hora.hora % 3 === 0 ? hora.label : ''}
                                    </span>
                                </div>
                            )
                        })}
                    </div>
                </div>

                {/* Legend */}
                <div className="mt-4 pt-3 border-t border-border/50 flex items-center gap-4">
                    <div className="flex items-center gap-1.5">
                        <div className="w-3 h-3 rounded" style={{ background: 'hsl(0, 80%, 55%)' }} />
                        <span className="text-[9px] text-muted-foreground">Pico</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <div className="w-3 h-3 rounded" style={{ background: 'hsl(30, 80%, 55%)' }} />
                        <span className="text-[9px] text-muted-foreground">Médio</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <div className="w-3 h-3 rounded" style={{ background: 'hsl(180, 60%, 50%)' }} />
                        <span className="text-[9px] text-muted-foreground">Baixo</span>
                    </div>
                </div>
            </div>
        </div>
    )
}
