import type { Funil } from '../../types/dashboard'
import { formatNumber, formatPercent } from './dashboard-utils'
import { ArrowDown } from 'lucide-react'

interface Props {
    data: Funil | null
    loading: boolean
}

export default function FunnelChart({ data, loading }: Props) {
    if (loading || !data) {
        return (
            <div>
                <div className="skeleton w-44 h-5 mb-6" />
                <div className="skeleton w-full h-48" />
            </div>
        )
    }

    const steps = [
        {
            label: 'Leads Captados',
            value: data.total_leads,
            pct: 100,
            color: '#2dd4bf',
            bg: 'rgba(45, 212, 191, 0.12)',
        },
        {
            label: 'Receberam Acesso',
            value: data.receberam_acesso,
            pct: data.total_leads > 0 ? (data.receberam_acesso / data.total_leads) * 100 : 0,
            color: '#38bdf8',
            bg: 'rgba(56, 189, 248, 0.12)',
        },
        {
            label: 'Pagaram',
            value: data.pagaram,
            pct: data.total_leads > 0 ? (data.pagaram / data.total_leads) * 100 : 0,
            color: '#34d399',
            bg: 'rgba(52, 211, 153, 0.12)',
        },
    ]

    // Taxas step-by-step
    const stepRates = [
        null,
        data.total_leads > 0 ? (data.receberam_acesso / data.total_leads) * 100 : 0,
        data.receberam_acesso > 0 ? (data.pagaram / data.receberam_acesso) * 100 : 0,
    ]

    return (
        <div>

            <div className="flex flex-col items-center gap-1">
                {steps.map((step, i) => {
                    const width = Math.max(step.pct, 20) // Mínimo 20% para visibilidade
                    return (
                        <div key={step.label} className="w-full flex flex-col items-center">
                            {/* Seta com taxa step-by-step */}
                            {i > 0 && stepRates[i] !== null && (
                                <div className="flex items-center gap-2 py-1.5">
                                    <ArrowDown size={14} className="text-muted-foreground" />
                                    <span className="text-xs font-semibold" style={{ color: step.color }}>
                                        {formatPercent(stepRates[i]!)} passaram
                                    </span>
                                    <span className="text-[10px] text-muted-foreground">
                                        ({formatNumber(steps[i - 1].value - step.value)} perdidos)
                                    </span>
                                </div>
                            )}

                            {/* Barra do funil */}
                            <div
                                className="relative rounded-xl flex items-center justify-between px-5 py-3.5 transition-all duration-700"
                                style={{
                                    width: `${width}%`,
                                    backgroundColor: step.bg,
                                    border: `1px solid ${step.color}30`,
                                    minWidth: '200px',
                                }}
                            >
                                <div className="flex items-center gap-2">
                                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: step.color }} />
                                    <span className="text-xs font-medium">{step.label}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-lg font-bold">{formatNumber(step.value)}</span>
                                    <span className="text-xs text-muted-foreground">({formatPercent(step.pct)})</span>
                                </div>
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
