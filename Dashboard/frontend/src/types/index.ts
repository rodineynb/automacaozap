export interface MetricsComparacao {
    total_leads: number
    total_pagos: number
    faturamento: number
    taxa_conversao: number
    receberam_acesso: number
    taxa_acesso_pagamento: number
    finalizados_sem_pagar: number
}

export interface Metrics {
    total_leads: number
    total_pagos: number
    faturamento: number
    taxa_conversao: number
    receberam_acesso: number
    taxa_acesso_pagamento: number
    finalizados_sem_pagar: number
    comparacao: MetricsComparacao
}

export interface Criativo {
    anuncio: string
    campanha: string
    total_leads: number
    total_vendas: number
    faturamento: number
    valores_detalhados: { valor: number; quantidade: number }[]
    taxa_conversao: number
}

export interface LeadPorDia {
    dia: string
    total_leads: number
    total_pagos: number
    faturamento: number
}

export interface Campanha {
    campanha: string
    total_leads: number
    total_pagos: number
    faturamento: number
    taxa_conversao: number
}

export interface Funil {
    total_leads: number
    receberam_acesso: number
    pagaram: number
    faturamento: number
}

export interface Lead {
    nome: string
    telefone: string
    produto: string
    campanha: string | null
    anuncio: string | null
    created_at: string
    pago: boolean
    valor_pagamento: number | null
    data_pagamento: string | null
    clicou_url: boolean
    nivel_followup: number | null
    finalizado: boolean
}

export interface LeadsResponse {
    data: Lead[]
    total: number
    page: number
    per_page: number
}

export interface Filtros {
    campanhas: string[]
    anuncios: string[]
    produtos: string[]
}

export interface FiltersState {
    data_inicio: string
    data_fim: string
    campanhas: string[]
    anuncios: string[]
    produto: string
    pago: string
    busca: string
}

export interface AnalyticsFaixa {
    label: string
    quantidade: number
    percentual: number
}

export interface AnalyticsHora {
    hora: number
    label: string
    quantidade: number
    percentual: number
}

export interface Analytics {
    total_pagos: number
    tempo_medio_minutos: number
    tempo_mediana_minutos: number
    faixas: AnalyticsFaixa[]
    horas_quentes: AnalyticsHora[]
}
