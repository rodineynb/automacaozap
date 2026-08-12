import './index.css'
import { useState, useCallback, useEffect } from 'react'
import { api } from './lib/api'
import type { Metrics, Criativo, LeadPorDia, Campanha, Funil, LeadsResponse, Filtros, FiltersState, Analytics } from './types'

import MetricCards from './components/MetricCards'
import LeadsChart from './components/LeadsChart'
import CriativosChart from './components/CriativosChart'
import CampanhasChart from './components/CampanhasChart'
import FunnelChart from './components/FunnelChart'
import LeadsTable from './components/LeadsTable'
import AnalyticsChart from './components/AnalyticsChart'
import {
  BarChart3, LayoutDashboard, TrendingUp, Megaphone,
  Target, Filter as FilterIcon, Table2, Menu, X, Calendar, Download, RefreshCw, Clock, MessageSquareText
} from 'lucide-react'

const API_URL = import.meta.env.VITE_API_URL || 'https://dashboard-leads-api.projetobrlatam.workers.dev'

// ══════════ TYPES ══════════
type SectionId = 'overview' | 'volume' | 'criativos' | 'campanhas' | 'funil' | 'analytics' | 'explorar'

interface NavItem {
  id: SectionId
  label: string
  icon: React.ReactNode
}

const NAV_ITEMS: NavItem[] = [
  { id: 'overview', label: 'Visão Geral', icon: <LayoutDashboard size={18} /> },
  { id: 'volume', label: 'Volume & Fat.', icon: <TrendingUp size={18} /> },
  { id: 'criativos', label: 'Criativos', icon: <Megaphone size={18} /> },
  { id: 'campanhas', label: 'Campanhas', icon: <Target size={18} /> },
  { id: 'funil', label: 'Funil', icon: <FilterIcon size={18} /> },
  { id: 'analytics', label: 'Analytics', icon: <Clock size={18} /> },
  { id: 'explorar', label: 'Explorar', icon: <Table2 size={18} /> },
]

// ══════════ DATE HELPERS ══════════
const DATE_PRESETS = [
  { label: 'Hoje', days: 0 },
  { label: 'Ontem', days: 1 },
  { label: '7D', days: 7 },
  { label: '14D', days: 14 },
  { label: '30D', days: 30 },
  { label: '60D', days: 60 },
]

function getSpDate(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
}

function calcPresetDates(days: number): { start: string; end: string } {
  const now = new Date()
  const todaySP = getSpDate(now)
  if (days === 0) return { start: todaySP, end: todaySP }
  if (days === 1) { const y = new Date(); y.setDate(y.getDate() - 1); return { start: getSpDate(y), end: getSpDate(y) } }
  const s = new Date(); s.setDate(s.getDate() - days)
  return { start: getSpDate(s), end: todaySP }
}

// ══════════ PERIOD FILTER BAR ══════════
function PeriodFilter({ start, end, activeDays, onPreset, onCustom }: {
  start: string; end: string; activeDays: number
  onPreset: (days: number) => void
  onCustom: (field: 'start' | 'end', value: string) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 mb-12 p-4 rounded-xl bg-[#0d1520]/60 border border-border">
      <Calendar size={14} className="text-primary/60 flex-shrink-0" />
      <div className="flex flex-wrap gap-1">
        {DATE_PRESETS.map(p => (
          <button key={p.days} onClick={() => onPreset(p.days)} className={`toggle-btn ${activeDays === p.days ? 'active' : ''}`}>{p.label}</button>
        ))}
      </div>
      <div className="flex items-center gap-1.5 ml-auto">
        <input type="date" value={start} onChange={e => onCustom('start', e.target.value)} className="date-input" />
        <span className="text-[10px] text-muted-foreground">→</span>
        <input type="date" value={end} onChange={e => onCustom('end', e.target.value)} className="date-input" />
      </div>
    </div>
  )
}

// ══════════ MINI-SELECT ══════════
function MiniSelect({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</span>
      <select value={value} onChange={e => onChange(e.target.value)} className="px-2 py-1 rounded-lg bg-accent/50 border border-border text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40 max-w-[160px]">
        <option value="">Todos</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  )
}

// ══════════════════════════════════
//  MAIN APP
// ══════════════════════════════════
function App() {

  // Navigation
  const [activeSection, setActiveSection] = useState<SectionId>(() => {
    const saved = localStorage.getItem('dashboard-section')
    return (saved as SectionId) || 'overview'
  })
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Period per section (each section has its own period)
  const [periods, setPeriods] = useState<Record<SectionId, { start: string; end: string; activeDays: number }>>(() => {
    const defaults = {
      overview: { ...calcPresetDates(30), activeDays: 30 },
      volume: { ...calcPresetDates(30), activeDays: 30 },
      criativos: { ...calcPresetDates(30), activeDays: 30 },
      campanhas: { ...calcPresetDates(30), activeDays: 30 },
      funil: { ...calcPresetDates(30), activeDays: 30 },
      analytics: { ...calcPresetDates(30), activeDays: 30 },
      explorar: { ...calcPresetDates(30), activeDays: 30 },
    }
    try {
      const saved = localStorage.getItem('dashboard-periods')
      if (saved) return { ...defaults, ...JSON.parse(saved) }
    } catch (e) { }
    return defaults
  })

  // Section-specific extra filters
  const [filtroVolume, setFiltroVolume] = useState({ produto: '', pago: '' })
  const [filtroCriativo, setFiltroCriativo] = useState({ campanha: '' })
  const [filtroCampanha, setFiltroCampanha] = useState({ produto: '' })
  const [explorerFilters, setExplorerFilters] = useState({ campanhas: '' as string, anuncios: '' as string, produto: '', pago: '', busca: '' })

  // Options
  const [options, setOptions] = useState<Filtros>({ campanhas: [], anuncios: [], produtos: [] })

  // Data
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [leadsPorDia, setLeadsPorDia] = useState<LeadPorDia[]>([])
  const [criativos, setCriativos] = useState<Criativo[]>([])
  const [campanhas, setCampanhas] = useState<Campanha[]>([])
  const [funil, setFunil] = useState<Funil | null>(null)
  const [leads, setLeads] = useState<LeadsResponse | null>(null)
  const [analyticsData, setAnalyticsData] = useState<Analytics | null>(null)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)

  // Save periods to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('dashboard-periods', JSON.stringify(periods))
  }, [periods])

  // Initial fetch on mount / section change
  useEffect(() => { api.getFiltros().then(setOptions).catch(console.error) }, [])

  const currentPeriod = periods[activeSection]

  const handlePreset = (days: number) => {
    const dates = calcPresetDates(days)
    setPeriods(prev => ({ ...prev, [activeSection]: { ...dates, activeDays: days } }))
  }

  const handleCustomDate = (field: 'start' | 'end', value: string) => {
    setPeriods(prev => ({ ...prev, [activeSection]: { ...prev[activeSection], [field]: value, activeDays: -1 } }))
  }

  // Fetch data for active section
  const fetchData = useCallback(async () => {
    setLoading(true)
    const p = periods[activeSection]
    const base: FiltersState = { data_inicio: p.start, data_fim: p.end, campanhas: [], anuncios: [], produto: '', pago: '', busca: '' }

    try {
      switch (activeSection) {
        case 'overview':
          setMetrics(await api.getMetrics(base))
          break
        case 'volume':
          setLeadsPorDia(await api.getLeadsPorDia({ ...base, produto: filtroVolume.produto, pago: filtroVolume.pago }))
          break
        case 'criativos':
          setCriativos(await api.getCriativos({ ...base, campanhas: filtroCriativo.campanha ? [filtroCriativo.campanha] : [] }))
          break
        case 'campanhas':
          setCampanhas(await api.getCampanhas({ ...base, produto: filtroCampanha.produto }))
          break
        case 'funil':
          setFunil(await api.getFunil(base))
          break
        case 'analytics':
          setAnalyticsData(await api.getAnalytics(base))
          break
        case 'explorar':
          setLeads(await api.getLeads({
            ...base,
            campanhas: explorerFilters.campanhas ? [explorerFilters.campanhas] : [],
            anuncios: explorerFilters.anuncios ? [explorerFilters.anuncios] : [],
            produto: explorerFilters.produto,
            pago: explorerFilters.pago,
            busca: explorerFilters.busca,
          }, page))
          break
      }
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }, [activeSection, periods, filtroVolume, filtroCriativo, filtroCampanha, explorerFilters, page])

  useEffect(() => { fetchData() }, [fetchData])

  const handleNav = (id: SectionId) => {
    setActiveSection(id)
    localStorage.setItem('dashboard-section', id)
    setSidebarOpen(false)
  }

  const sectionTitle = NAV_ITEMS.find(n => n.id === activeSection)?.label || ''

  return (
    <div className="dashboard-layout">
      {/* ═══ SIDEBAR (Desktop) ═══ */}
      <aside className={`sidebar ${sidebarOpen ? 'sidebar-open' : ''}`}>
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-5 pt-6 pb-12">
          <div className="p-2 rounded-xl bg-gradient-to-br from-teal/25 to-cyan-bg border border-teal/15">
            <BarChart3 size={18} className="text-primary-light" />
          </div>
          <div>
            <h1 className="text-sm font-bold gradient-text">Dashboard</h1>
            <p className="text-[9px] text-muted-foreground">Leads & Conversão</p>
          </div>
          {/* Close button on mobile */}
          <button onClick={() => setSidebarOpen(false)} className="ml-auto lg:hidden p-1 rounded-lg hover:bg-accent/50 text-muted-foreground">
            <X size={18} />
          </button>
        </div>

        {/* Nav items */}
        <nav className="px-3 space-y-1 flex-1">
          {NAV_ITEMS.map(item => (
            <button
              key={item.id}
              onClick={() => handleNav(item.id)}
              className={`nav-item ${activeSection === item.id ? 'nav-item-active' : ''}`}
            >
              <div className={`nav-icon ${activeSection === item.id ? 'nav-icon-active' : ''}`}>
                {item.icon}
              </div>
              <span className="text-[13px]">{item.label}</span>
            </button>
          ))}
        </nav>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-border mt-auto">
          <p className="text-[9px] text-muted-foreground">UTC-3 • São Paulo</p>
          <p className="text-[9px] text-primary/50">v4.0</p>
        </div>
      </aside>

      {/* Overlay mobile */}
      {sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />}

      {/* ═══ MAIN CONTENT ═══ */}
      <main className="main-content">
        {/* Top bar */}
        <header className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-2.5 rounded-xl border border-border hover:bg-accent/50 text-muted-foreground transition-colors">
              <Menu size={22} />
            </button>
            <div>
              <h2 className="text-lg font-bold">{sectionTitle}</h2>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {loading && (
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                <span className="text-[10px] text-primary-light">Carregando...</span>
              </div>
            )}
            <button
              onClick={() => fetchData()}
              disabled={loading}
              className="p-2 rounded-xl border border-border hover:bg-accent/50 text-muted-foreground hover:text-primary-light transition-colors disabled:opacity-50"
              title="Atualizar dados"
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </header>

        {/* Period filter (all sections) */}
        <PeriodFilter
          start={currentPeriod.start}
          end={currentPeriod.end}
          activeDays={currentPeriod.activeDays}
          onPreset={handlePreset}
          onCustom={handleCustomDate}
        />

        {/* Spacer between filter and content */}
        <div style={{ height: '36px' }} />

        {/* ═══ SECTION CONTENT ═══ */}
        <div className="section-content">
          {/* OVERVIEW */}
          {activeSection === 'overview' && (
            <div className="animate-fade-in-up">
              <MetricCards metrics={metrics} loading={loading} />
            </div>
          )}

          {/* VOLUME & FATURAMENTO */}
          {activeSection === 'volume' && (
            <div className="animate-fade-in-up">
              <div className="flex flex-wrap items-center gap-3 mb-4">
                <MiniSelect label="Produto" value={filtroVolume.produto} options={options.produtos} onChange={v => setFiltroVolume(f => ({ ...f, produto: v }))} />
                <div className="flex gap-1">
                  {[{ l: 'Todos', v: '' }, { l: 'Pagos', v: 'true' }, { l: 'Não pagos', v: 'false' }].map(o => (
                    <button key={o.v} onClick={() => setFiltroVolume(f => ({ ...f, pago: o.v }))} className={`toggle-btn text-[10px] ${filtroVolume.pago === o.v ? 'active' : ''}`}>{o.l}</button>
                  ))}
                </div>
              </div>
              <div className="glass-card py-5 px-6 sm:px-8">
                <LeadsChart data={leadsPorDia} loading={loading} />
              </div>
            </div>
          )}

          {/* CRIATIVOS */}
          {activeSection === 'criativos' && (
            <div className="animate-fade-in-up">
              <div className="flex flex-wrap items-center gap-3 mb-4">
                <MiniSelect label="Campanha" value={filtroCriativo.campanha} options={options.campanhas} onChange={v => setFiltroCriativo({ campanha: v })} />
              </div>
              <div className="glass-card py-5 px-6 sm:px-8">
                <CriativosChart data={criativos} loading={loading} />
              </div>
            </div>
          )}

          {/* CAMPANHAS */}
          {activeSection === 'campanhas' && (
            <div className="animate-fade-in-up">
              <div className="flex flex-wrap items-center gap-3 mb-4">
                <MiniSelect label="Produto" value={filtroCampanha.produto} options={options.produtos} onChange={v => setFiltroCampanha({ produto: v })} />
              </div>
              <div className="glass-card py-5 px-6 sm:px-8">
                <CampanhasChart data={campanhas} loading={loading} />
              </div>
            </div>
          )}

          {/* FUNIL */}
          {activeSection === 'funil' && (
            <div className="animate-fade-in-up">
              <div className="glass-card py-5 px-6 sm:px-8">
                <FunnelChart data={funil} loading={loading} />
              </div>
            </div>
          )}

          {/* ANALYTICS */}
          {activeSection === 'analytics' && (
            <div className="animate-fade-in-up">
              <AnalyticsChart data={analyticsData} loading={loading} />
            </div>
          )}

          {/* EXPLORAR DADOS */}
          {activeSection === 'explorar' && (
            <div className="animate-fade-in-up">
              {/* Extra filters */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 mb-8 p-4 rounded-xl bg-[#0d1520]/60 border border-border">
                <div>
                  <label className="filter-label">Campanha</label>
                  <select value={explorerFilters.campanhas} onChange={e => setExplorerFilters(f => ({ ...f, campanhas: e.target.value }))} className="filter-select">
                    <option value="">Todas</option>
                    {options.campanhas.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="filter-label">Criativo</label>
                  <select value={explorerFilters.anuncios} onChange={e => setExplorerFilters(f => ({ ...f, anuncios: e.target.value }))} className="filter-select">
                    <option value="">Todos</option>
                    {options.anuncios.map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>
                <div>
                  <label className="filter-label">Produto</label>
                  <select value={explorerFilters.produto} onChange={e => setExplorerFilters(f => ({ ...f, produto: e.target.value }))} className="filter-select">
                    <option value="">Todos</option>
                    {options.produtos.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label className="filter-label">Status</label>
                  <div className="flex gap-1">
                    {[{ l: 'Todos', v: '' }, { l: 'Pagos', v: 'true' }, { l: 'Não', v: 'false' }].map(o => (
                      <button key={o.v} onClick={() => setExplorerFilters(f => ({ ...f, pago: o.v }))} className={`toggle-btn text-[10px] flex-1 ${explorerFilters.pago === o.v ? 'active' : ''}`}>{o.l}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="filter-label">Buscar</label>
                  <input type="text" placeholder="Nome ou telefone..." value={explorerFilters.busca} onChange={e => setExplorerFilters(f => ({ ...f, busca: e.target.value }))} className="filter-select placeholder:text-muted-foreground" />
                </div>
              </div>

              {/* Export Buttons */}
              <div className="flex flex-wrap items-center gap-3 mb-8">
                <a href={`${API_URL}/api/export-meta?tipo=compradores`} download className="export-btn">
                  <Download size={14} />
                  <span>Compradores</span>
                </a>
                <a href={`${API_URL}/api/export-meta?tipo=acesso`} download className="export-btn">
                  <Download size={14} />
                  <span>Receberam Acesso</span>
                </a>
                <a href={`${API_URL}/api/export-meta?tipo=acesso_sem_pagar`} download className="export-btn">
                  <Download size={14} />
                  <span>Acesso s/ Pgto</span>
                </a>
                <a href={`${API_URL}/api/export-meta?tipo=sem_acesso`} download className="export-btn">
                  <Download size={14} />
                  <span>Sem Acesso</span>
                </a>
                <a href={`${API_URL}/api/export-meta?tipo=todos`} download className="export-btn">
                  <Download size={14} />
                  <span>Todos os Leads</span>
                </a>

                {/* Separador visual */}
                <div className="w-px h-6 bg-border mx-1" />

                {/* Conversas Memória Recheios */}
                <a href={`${API_URL}/api/export-conversas`} download className="export-btn" style={{ background: 'linear-gradient(135deg, rgba(168,85,247,0.15), rgba(139,92,246,0.08))', borderColor: 'rgba(168,85,247,0.3)' }}>
                  <MessageSquareText size={14} style={{ color: '#c084fc' }} />
                  <span>Conversas</span>
                </a>
              </div>

              <div className="glass-card py-5 px-6 sm:px-8">
                <LeadsTable data={leads} loading={loading} page={page} onPageChange={setPage} />
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

export default App
