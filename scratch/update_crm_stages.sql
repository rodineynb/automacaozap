UPDATE automation_crm_stages
SET message = '[{"type":"text","content":"Oi, {{nome}}! 😊\n\nTudo bem? Aqui é do {{produto}}. Passando pra saber se tá tudo certinho com o seu acesso!\n\nA gente tá sempre buscando melhorar, sabe? Então queria te pedir um favorzão rápido...\n\nO que te chamou mais atenção no nosso produto? O que fez você querer garantir o seu? 🤔\n\nPode falar à vontade, é só pra gente entender melhor e continuar melhorando cada vez mais! 💪","file_name":null}]'
WHERE automation_id = 'ed8b03d0-9c4a-481e-81c1-cd6633bd3b93' AND key = 'satisfaction';

UPDATE automation_crm_stages
SET message = '[{"type":"text","content":"E aí, {{nome}}! 😄\n\nJá faz uns dias que você tá com o {{produto}}... queria saber como tá sendo a experiência!\n\nSe puder, seria incrível se você gravasse um videozinho curtinho (pode ser de 30 segundinhos!) contando o que achou. 🎬\n\nSabe por quê? Tem muita gente que fica na dúvida de comprar pela internet, né? E ouvir de alguém que já comprou ajuda demais essas pessoas a tomarem a decisão!\n\nVocê estaria ajudando muita gente! Se preferir, pode mandar um áudio também, tá? 🎙️\n\nO que acha?","file_name":null}]'
WHERE automation_id = 'ed8b03d0-9c4a-481e-81c1-cd6633bd3b93' AND key = 'testimonial';
