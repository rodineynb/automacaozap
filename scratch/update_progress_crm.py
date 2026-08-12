import re

file_path = "PROGRESS.md"

with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# Locate "Fase atual:..." and insert the new section under Status Geral do Projeto
new_entry = """### [2026-06-01] - Reorganização das Abas do CRM e Seleção de Automação Ativa por Padrão

- [x] **Seleção de Automação Ativa por Padrão no CRM (`app/routes/crm.tsx`)**:
  - Removida a opção "Todas as Automações" ("all") do dropdown de seleção superior.
  - Implementada lógica reativa no mount (`loadAutomations`) para selecionar automaticamente a primeira automação ativa da lista retornada.
- [x] **Remoção de Visão Geral do CRM**:
  - Excluída a antiga aba de Métricas / Visão Geral ("overview") do CRM, evitando duplicidade já que esses dados já foram incorporados no Dashboard central sob o nome de "Métricas de CRM".
- [x] **Promoção da Seção de Configurações para "Visão Geral"**:
  - Movida a antiga aba de "Configurações" (gerenciador de estágios do CRM) para a primeira posição do menu horizontal de navegação.
  - Renomeada a aba para "📋 Visão Geral", proporcionando acesso imediato e direto à configuração dos fluxos de pós-venda.
- [x] **Correções e Estabilidade do TypeScript**:
  - Resolvidos erros de JSX e formatação causados por substituições parciais anteriores.
  - Corrigido o botão de atualização e removidas verificações obsoletas da aba "overview" que causavam erros de compilação do TypeScript.
  - Testado com sucesso via `npm run typecheck` (zero erros).

"""

pattern = r"(### \[2026-06-01\] - Sistema de Usuários e Permissões Granulares)"
match = re.search(pattern, content)

if match:
    updated_content = content.replace(match.group(1), new_entry + match.group(1))
    with open(file_path, "w", encoding="utf-8") as f:
        f.write(updated_content)
    print("PROGRESS.md updated successfully!")
else:
    print("Target section not found.")
