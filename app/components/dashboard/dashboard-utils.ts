export function formatNumber(n: number): string {
    return new Intl.NumberFormat('pt-BR').format(n)
}

export function formatPercent(n: number): string {
    return `${n.toFixed(1)}%`
}

export function formatCurrency(n: number): string {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n)
}

/**
 * Normaliza strings de data do D1/SQLite (UTC) para Date objects corretos.
 * O D1 armazena datas como "2026-05-29 00:10:00" (UTC sem 'Z').
 * Sem o 'Z', new Date() interpreta como hora local, causando offset duplo.
 */
function parseUtcDate(date: string): Date {
    if (!date) return new Date();
    // Se já tem 'Z' ou offset (+/-), não mexer
    if (/[Z+]/.test(date) || /T\d{2}:\d{2}:\d{2}[+-]/.test(date)) {
        return new Date(date);
    }
    // Adicionar 'Z' para indicar UTC e trocar espaço por 'T' para ISO compliant
    const normalized = date.replace(' ', 'T') + 'Z';
    return new Date(normalized);
}

export function formatDate(date: string): string {
    if (!date) return '';
    return parseUtcDate(date).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        timeZone: 'America/Sao_Paulo',
    })
}

export function formatDateTime(date: string): string {
    if (!date) return '';
    return parseUtcDate(date).toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'America/Sao_Paulo',
    })
}

export function formatDateShort(date: string): string {
    if (!date) return '';
    return parseUtcDate(date).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        timeZone: 'America/Sao_Paulo',
    })
}
