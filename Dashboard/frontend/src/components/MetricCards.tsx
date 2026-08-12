import { formatNumber, formatPercent, formatCurrency } from '../lib/utils'
import { TrendingUp, TrendingDown, Users, CreditCard, MousePointerClick, ArrowUpRight, Target, UserX, DollarSign } from 'lucide-react'
import type { Metrics } from '../types'

interface CardData {
    title: string
    value: string
    icon: React.ReactNode
    accentColor: string
    bgGradient: string
    subtitle?: string
    trend?: { value: number }
}

function calcTrend(current: number, previous: number): number {
    if (previous === 0) return current > 0 ? 100 : 0
    return Math.round(((current - previous) / previous) * 1000) / 10
}

function MetricCard({ title, value, icon, accentColor, bgGradient, subtitle, trend }: CardData) {
    const isPositive = trend && trend.value >= 0
    return (
        <div className="glass-card metric-card animate-fade-in-up" style={{ '--accent': accentColor, padding: '14px 16px' } as React.CSSProperties}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', borderRadius: '1.25rem 1.25rem 0 0', background: accentColor, opacity: 0.5 }} />
            <div className="flex items-start justify-between mb-4">
                <div className="rounded-xl p-2.5" style={{ background: bgGradient }}>
                    <div style={{ color: accentColor }}>{icon}</div>
                </div>
                {trend && (
                    <div className={`flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-lg ${isPositive ? 'bg-success-bg text-success' : 'bg-danger-bg text-danger'}`}>
                        {isPositive ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                        {isPositive ? '+' : ''}{trend.value}%
                    </div>
                )}
            </div>
            <p className="text-2xl sm:text-3xl font-bold tracking-tight mb-1">{value}</p>
            <p className="text-xs text-muted-foreground font-medium">{title}</p>
            {subtitle && <p className="text-[10px] text-muted-foreground/50 mt-1.5">{subtitle}</p>}
        </div>
    )
}

function SkeletonCard() {
    return (
        <div className="glass-card p-6">
            <div className="flex items-start justify-between mb-4">
                <div className="skeleton w-11 h-11 rounded-xl" />
                <div className="skeleton w-14 h-6 rounded-lg" />
            </div>
            <div className="skeleton w-24 h-8 mb-1" />
            <div className="skeleton w-28 h-4 mt-2" />
        </div>
    )
}

interface Props {
    metrics: Metrics | null
    loading: boolean
}

export default function MetricCards({ metrics, loading }: Props) {
    if (loading || !metrics) {
        return (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5">
                {Array.from({ length: 7 }).map((_, i) => <SkeletonCard key={i} />)}
            </div>
        )
    }

    const cards: CardData[] = [
        {
            title: 'Total de Leads',
            value: formatNumber(metrics.total_leads),
            icon: <Users size={22} />,
            accentColor: '#2dd4bf',
            bgGradient: 'linear-gradient(135deg, rgba(45,212,191,0.15), rgba(45,212,191,0.05))',
            subtitle: 'no período',
            trend: { value: calcTrend(metrics.total_leads, metrics.comparacao.total_leads) },
        },
        {
            title: 'Leads Pagantes',
            value: formatNumber(metrics.total_pagos),
            icon: <CreditCard size={22} />,
            accentColor: '#38bdf8',
            bgGradient: 'linear-gradient(135deg, rgba(56,189,248,0.15), rgba(56,189,248,0.05))',
            trend: { value: calcTrend(metrics.total_pagos, metrics.comparacao.total_pagos) },
        },
        {
            title: 'Faturamento',
            value: formatCurrency(metrics.faturamento),
            icon: <DollarSign size={22} />,
            accentColor: '#34d399',
            bgGradient: 'linear-gradient(135deg, rgba(52,211,153,0.15), rgba(52,211,153,0.05))',
            subtitle: `ticket: ${metrics.total_pagos > 0 ? formatCurrency(metrics.faturamento / metrics.total_pagos) : 'R$ 0'}`,
            trend: { value: calcTrend(metrics.faturamento, metrics.comparacao.faturamento) },
        },
        {
            title: 'Taxa Conversão',
            value: formatPercent(metrics.taxa_conversao),
            icon: <Target size={22} />,
            accentColor: '#fb923c',
            bgGradient: 'linear-gradient(135deg, rgba(251,146,60,0.15), rgba(251,146,60,0.05))',
            subtitle: `${formatNumber(metrics.total_pagos)} de ${formatNumber(metrics.total_leads)}`,
            trend: { value: calcTrend(metrics.taxa_conversao, metrics.comparacao.taxa_conversao) },
        },
        {
            title: 'Receberam Acesso',
            value: formatNumber(metrics.receberam_acesso),
            icon: <MousePointerClick size={22} />,
            accentColor: '#fbbf24',
            bgGradient: 'linear-gradient(135deg, rgba(251,191,36,0.15), rgba(251,191,36,0.05))',
            subtitle: `${metrics.total_leads > 0 ? formatPercent((metrics.receberam_acesso / metrics.total_leads) * 100) : '0%'} do total`,
            trend: { value: calcTrend(metrics.receberam_acesso, metrics.comparacao.receberam_acesso) },
        },
        {
            title: 'Acesso→Pgto',
            value: formatPercent(metrics.taxa_acesso_pagamento),
            icon: <ArrowUpRight size={22} />,
            accentColor: '#22d3ee',
            bgGradient: 'linear-gradient(135deg, rgba(34,211,238,0.15), rgba(34,211,238,0.05))',
            subtitle: 'eficiência do acesso',
            trend: metrics.comparacao.taxa_acesso_pagamento !== undefined
                ? { value: calcTrend(metrics.taxa_acesso_pagamento, metrics.comparacao.taxa_acesso_pagamento) }
                : undefined,
        },
        {
            title: 'Perdidos',
            value: formatNumber(metrics.finalizados_sem_pagar),
            icon: <UserX size={22} />,
            accentColor: '#fb7185',
            bgGradient: 'linear-gradient(135deg, rgba(251,113,133,0.15), rgba(251,113,133,0.05))',
            subtitle: 'finaliz. sem pagar',
            trend: metrics.comparacao.finalizados_sem_pagar !== undefined
                ? { value: calcTrend(metrics.finalizados_sem_pagar, metrics.comparacao.finalizados_sem_pagar) }
                : undefined,
        },
    ]

    return (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5">
            {cards.map((card, i) => (
                <div key={i} style={{ animationDelay: `${i * 60}ms` }} className="animate-fade-in-up">
                    <MetricCard {...card} />
                </div>
            ))}
        </div>
    )
}
