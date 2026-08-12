import { Hono } from 'hono'
import { getSupabase, fetchAll, type Env } from '../lib/supabase'

const filtros = new Hono<{ Bindings: Env }>()

filtros.get('/', async (c) => {
    const supabase = getSupabase(c.env)

    // Buscar campanhas/anuncios distintos do tracking — paginado
    const trackData = await fetchAll(supabase, 'tracking_zap_face', 'campanha, anuncio')

    const campanhasSet = new Set<string>()
    const anunciosSet = new Set<string>()
    for (const t of trackData) {
        if (t.campanha) campanhasSet.add(t.campanha)
        if (t.anuncio) anunciosSet.add(t.anuncio)
    }

    // Buscar produtos distintos do followup — paginado
    const followupData = await fetchAll(supabase, 'bd_recheios_followup', 'produto')

    const produtosSet = new Set<string>()
    for (const f of followupData) {
        if (f.produto) produtosSet.add(f.produto)
    }

    return c.json({
        campanhas: Array.from(campanhasSet).sort(),
        anuncios: Array.from(anunciosSet).sort(),
        produtos: Array.from(produtosSet).sort(),
    })
})

export default filtros
