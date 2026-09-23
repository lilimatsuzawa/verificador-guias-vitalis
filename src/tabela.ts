import { readFileSync, writeFileSync } from "node:fs";
import { GuiaCrua, Regras, Resultado, verificarGuia, origemDe } from "./nucleo.js";

// --- reaproveita o parser e o carregador do rodar.ts (copiado aqui pra ser standalone) ---
function parseCSV(txt: string): string[][] {
  const rows: string[][] = []; let field = "", row: string[] = [], inQ = false;
  for (let i = 0; i < txt.length; i++) {
    const c = txt[i];
    if (inQ) { if (c === '"') { if (txt[i + 1] === '"') { field += '"'; i++; } else inQ = false; } else field += c; }
    else { if (c === '"') inQ = true; else if (c === ",") { row.push(field); field = ""; } else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; } else if (c === "\r") {} else field += c; }
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows;
}
function carregarGuias(caminho: string): GuiaCrua[] {
  const linhas = parseCSV(readFileSync(caminho, "utf8"));
  const header = linhas[0];
  return linhas.slice(1).filter((l) => l.length > 1).map((l) => {
    const o: any = {}; header.forEach((h, i) => (o[h] = (l[i] ?? "").trim())); return o as GuiaCrua;
  });
}

const regras: Regras = JSON.parse(readFileSync("data/regras_convenio.json", "utf8"));
const guias = carregarGuias("data/guias.csv");
const tag = { regra: "regra", observacao: "obs", dicionario: "dic" } as const;

// motivos de uma guia como "[regra] TIPO: mensagem" (só os que bloqueiam)
function motivosTexto(r: Resultado): string {
  const bloq = r.problemas.filter((p) => p.severidade === "bloqueia");
  if (!bloq.length) return "—";
  return bloq.map((p) => `[${tag[origemDe(p.tipo)]}] ${p.tipo}`).join(" · ");
}

const resultados: Resultado[] = guias.map((g) => verificarGuia(g, regras));

// ---------------- Markdown ----------------
let md = `# Tabela de conferência — 80 guias (agosto/2026)\n\n`;
md += `Legenda de origem: **[regra]** = veio de regras_convenio.json · **[obs]** = veio da observação da recepção (IA) · **[dic]** = coerência do dicionário (CREFITO/CRM).\n\n`;
md += `| Guia | Convênio | Procedimento | Atend. | Valor | Decisão | Motivos (origem · tipo) |\n`;
md += `|---|---|---|---|---|---|---|\n`;
for (let i = 0; i < guias.length; i++) {
  const g = guias[i], r = resultados[i];
  md += `| ${g.id_guia} | ${g.convenio} | ${r.procedimento} | ${g.data_atendimento} | R$ ${g.valor} | ${r.decisao} | ${motivosTexto(r)} |\n`;
}
writeFileSync("tabela_conferencia.md", md);

// ---------------- CSV (base dos testes) ----------------
const esc = (s: string) => `"${(s ?? "").replace(/"/g, '""')}"`;
let csv = "id_guia,convenio,procedimento,data_atendimento,valor,decisao,tipos,origens,motivos_detalhados\n";
for (let i = 0; i < guias.length; i++) {
  const g = guias[i], r = resultados[i];
  const bloq = r.problemas.filter((p) => p.severidade === "bloqueia");
  const tipos = bloq.map((p) => p.tipo).join("|");
  const origens = bloq.map((p) => origemDe(p.tipo)).join("|");
  const det = bloq.map((p) => `${p.tipo}: ${p.motivo}`).join(" || ");
  csv += [esc(g.id_guia), esc(g.convenio), esc(r.procedimento), esc(g.data_atendimento), esc(g.valor), esc(r.decisao), esc(tipos), esc(origens), esc(det)].join(",") + "\n";
}
writeFileSync("tabela_conferencia.csv", csv);

// ---------------- Resumo no console ----------------
const pend = resultados.filter((r) => r.decisao === "PENDENTE");
const soRegra = pend.filter((r) => r.problemas.filter(p=>p.severidade==="bloqueia").every((p) => origemDe(p.tipo) === "regra"));
const comObs = pend.filter((r) => r.problemas.some((p) => p.severidade==="bloqueia" && origemDe(p.tipo) === "observacao"));
const comDic = pend.filter((r) => r.problemas.some((p) => p.severidade==="bloqueia" && origemDe(p.tipo) === "dicionario"));
console.log(`Total: ${resultados.length} | OK: ${resultados.length - pend.length} | PENDENTES: ${pend.length}`);
console.log(`Pendentes só por regra (JSON): ${soRegra.length}`);
console.log(`Pendentes que dependem da observação (IA): ${comObs.length} -> ${comObs.map(r=>r.id_guia).join(", ")}`);
console.log(`Pendentes pelo dicionário (CREFITO/CRM): ${comDic.length} -> ${comDic.map(r=>r.id_guia).join(", ")}`);
console.log("Arquivos gerados: tabela_conferencia.md, tabela_conferencia.csv");
