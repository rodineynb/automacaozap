import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { Env } from './lib/supabase'
import metrics from './routes/metrics'
import criativos from './routes/criativos'
import leadsPorDia from './routes/leads-por-dia'
import campanhas from './routes/campanhas'
import funil from './routes/funil'
import leads from './routes/leads'
import filtros from './routes/filtros'
import exportMeta from './routes/export-meta'
import analytics from './routes/analytics'
import exportConversas from './routes/export-conversas'

const app = new Hono<{ Bindings: Env }>()

// CORS para aceitar requests do frontend
app.use('*', cors({
    origin: '*',
    allowMethods: ['GET', 'OPTIONS'],
    allowHeaders: ['Content-Type'],
}))

// Health check
app.get('/', (c) => c.json({ status: 'ok', service: 'dashboard-leads-api' }))

// Rotas da API
app.route('/api/metrics', metrics)
app.route('/api/criativos', criativos)
app.route('/api/leads-por-dia', leadsPorDia)
app.route('/api/campanhas', campanhas)
app.route('/api/funil', funil)
app.route('/api/leads', leads)
app.route('/api/filtros', filtros)
app.route('/api/export-meta', exportMeta)
app.route('/api/export-conversas', exportConversas)
app.route('/api/analytics', analytics)

// 404 handler
app.notFound((c) => c.json({ error: 'Not found' }, 404))

// Error handler
app.onError((err, c) => {
    console.error('Worker error:', err)
    return c.json({ error: 'Internal server error' }, 500)
})

export default app
