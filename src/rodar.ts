import { readFileSync } from "node:fs";
import { GuiaCrua, Regras, verificarGuia, gerarRelatorio, Resultado } from "./nucleo.js";

// Parser CSV mínimo, mas correto: respeita campos entre aspas com vírgula dentro
// (a coluna observacao_recepcao tem vírgulas) e aspas escapadas ("").
function parseCSV(txt: string): string[][] {
  const rows: string[][] = [];
  let field = "", row: string[] = [], inQ = false;
  for (let i = 0; i < txt.length; i++) {
    const c = txt[i];
    if (inQ) {
      if (c === '"') { if (txt[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
      else if (c === "\r") { /* ignora */ }
      else field += c;
    }
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function carregarGuias(caminho: string): GuiaCrua[] {
  const linhas = parseCSV(readFileSync(caminho, "utf8"));
  const header = linhas[0];
  return linhas.slice(1).filter((l) => l.length > 1).map((l) => {
    const o: any = {};
    header.forEach((h, i) => (o[h] = (l[i] ?? "").trim()));
    return o as GuiaCrua;
  });
}

const regras: Regras = JSON.parse(readFileSync("data/regras_convenio.json", "utf8"));
const guias = carregarGuias("data/guias.csv");
const resultados: Resultado[] = guias.map((g) => verificarGuia(g, regras));

// --- Guias PENDENTES, com motivo ---
console.log("=".repeat(78));
console.log("GUIAS PENDENTES");
console.log("=".repeat(78));
for (const r of resultados.filter((x) => x.decisao === "PENDENTE")) {
  console.log(`\n${r.id_guia}  [${r.convenio}]  R$ ${r.valor_em_risco.toFixed(2)} em risco`);
  for (const p of r.problemas) console.log(`   • (${p.severidade}) ${p.tipo}: ${p.motivo}`);
}

// --- Relatório de terça ---
const rel = gerarRelatorio(resultados);
console.log("\n" + "=".repeat(78));
console.log("RELATÓRIO DE TERÇA — Dr. Renato");
console.log("=".repeat(78));
console.log(`Guias verificadas: ${rel.total}`);
console.log(`OK: ${rel.ok}   |   Pendentes: ${rel.pendentes}`);
console.log(`Dinheiro em risco (mês, amostra de agosto): R$ ${rel.valor_em_risco_total.toFixed(2)}`);
console.log("\nPor tipo de problema:");
for (const t of rel.por_tipo)
  console.log(`   ${t.quantidade.toString().padStart(2)}x  ${t.tipo.padEnd(26)}  R$ ${t.valor_em_risco.toFixed(2)}`);
console.log("\nPor convênio:");
for (const c of rel.por_convenio)
  console.log(`   ${c.convenio.padEnd(16)} ${c.pendentes}/${c.total} pendentes   R$ ${c.valor_em_risco.toFixed(2)} em risco`);
