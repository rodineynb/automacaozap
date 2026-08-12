import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
}

export function formatNumber(n: number): string {
    return new Intl.NumberFormat('pt-BR').format(n)
}

export function formatPercent(n: number): string {
    return `${n.toFixed(1)}%`
}

export function formatCurrency(n: number): string {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n)
}

export function formatDate(date: string): string {
    return new Date(date).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        timeZone: 'America/Sao_Paulo',
    })
}

export function formatDateTime(date: string): string {
    return new Date(date).toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'America/Sao_Paulo',
    })
}

export function formatDateShort(date: string): string {
    return new Date(date).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        timeZone: 'America/Sao_Paulo',
    })
}

export function getDefaultDateRange(): { data_inicio: string; data_fim: string } {
    // Usar timezone de SP para calcular "hoje"
    const now = new Date()
    const spFormatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    })
    const todaySP = spFormatter.format(now)
    const start = new Date(todaySP + 'T00:00:00')
    start.setDate(start.getDate() - 30)
    return {
        data_inicio: start.toISOString().split('T')[0],
        data_fim: todaySP,
    }
}
