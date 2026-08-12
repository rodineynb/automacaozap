const clean = `*   **Valor:** R$ 10,00
*   **Data/Hora:** 03 de junho de 2026, 11:47
*   **Nome do pagador:** Rosinete Maria Alfaro Escobar
*   **Nome do recebedor:** R G Feitosa 153df
*   **Banco (recebedor):** 403 - CORA SCFI
*   **Chave PIX:** +5561982277206
*   **ID da transação:** E31872495202606031447GXvk3UgTdjh`;

const monthMap = {
  janeiro: '01', fevereiro: '02', 'março': '03', marco: '03', abril: '04',
  maio: '05', junho: '06', julho: '07', agosto: '08', setembro: '09',
  outubro: '10', novembro: '11', dezembro: '12'
};

let data = 'não identificada';
const dateMatches = clean.match(/(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/);
if (dateMatches) {
  data = `${dateMatches[1]}/${dateMatches[2]}/${dateMatches[3]}`;
} else {
  // Tentar formato nominal: "03 de junho de 2026"
  const nominalMatch = clean.match(/(\d{1,2})\s+de\s+(janeiro|fevereiro|março|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\s+de\s+(\d{4})/i);
  if (nominalMatch) {
    const day = nominalMatch[1].padStart(2, '0');
    const monthName = nominalMatch[2].toLowerCase();
    const month = monthMap[monthName];
    const year = nominalMatch[3];
    data = `${day}/${month}/${year}`;
  }
}

console.log('data:', data);
