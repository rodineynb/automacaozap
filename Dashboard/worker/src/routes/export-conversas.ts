import { Hono } from 'hono'
import { getSupabase, type Env } from '../lib/supabase'

const exportConversas = new Hono<{ Bindings: Env }>()

/**
 * Exporta todas as conversas da tabela memoria_recheios
 * usando uma função RPC do banco que agrega tudo em uma única chamada
 * (evita o limite de 50 subrequests do Cloudflare Workers)
 */
exportConversas.get('/', async (c) => {
    const supabase = getSupabase(c.env)

    // Uma única chamada RPC — retorna sessões já agrupadas
    const { data, error } = await supabase.rpc('export_conversas')

    if (error) return c.json({ error: error.message }, 500)
    if (!data || data.length === 0) {
        return c.text('Nenhuma conversa encontrada', 404)
    }

    // Contar total de mensagens
    let totalMsgs = 0
    for (const row of data) {
        totalMsgs += row.messages.length
    }

    // Formato TXT legível
    const lines: string[] = []

    lines.push('═══════════════════════════════════════════════════════════')
    lines.push('  CONVERSAS - MEMÓRIA RECHEIOS')
    lines.push(`  Total: ${data.length} conversas | ${totalMsgs} mensagens`)
    lines.push(`  Exportado em: ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`)
    lines.push('═══════════════════════════════════════════════════════════')
    lines.push('')

    let conversaNum = 0
    for (const row of data) {
        conversaNum++
        lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
        lines.push(`  CONVERSA #${conversaNum} | Sessão: ${row.session_id}`)
        lines.push(`  Total de mensagens: ${row.messages.length}`)
        lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
        lines.push('')

        for (const msg of row.messages) {
            const remetente = msg.type === 'human' ? '👤 CLIENTE' : msg.type === 'ai' ? '🤖 IA' : `📌 ${(msg.type || 'unknown').toUpperCase()}`
            lines.push(`  ${remetente}:`)
            const contentLines = (msg.content || '').split('\n')
            for (const cl of contentLines) {
                lines.push(`    ${cl}`)
            }
            lines.push('')
        }

        lines.push('')
    }

    lines.push('═══════════════════════════════════════════════════════════')
    lines.push('  FIM DO RELATÓRIO')
    lines.push('═══════════════════════════════════════════════════════════')

    const txt = lines.join('\n')

    return new Response(txt, {
        headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'Content-Disposition': 'attachment; filename="conversas_memoria_recheios.txt"',
            'Access-Control-Allow-Origin': '*',
        },
    })
})

export default exportConversas
