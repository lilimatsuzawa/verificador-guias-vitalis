// dados.ts — carrega guias.csv e regras_convenio.json.
// Resolve os caminhos a partir da localização deste arquivo (não do diretório
// de onde o processo foi chamado), pra funcionar quando o MCP for iniciado por
// outra ferramenta (Claude Desktop, Inspector) com cwd diferente.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { GuiaCrua, Regras } from "./nucleo.js";

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, ".."); // src/ -> raiz do projeto
const dataPath = (arquivo: string) => join(RAIZ, "data", arquivo);

// Parser CSV mínimo e correto: respeita campos entre aspas com vírgula dentro.
export function parseCSV(txt: string): string[][] {
  const rows: string[][] = [];
  let field = "", row: string[] = [], inQ = false;
  for (let i = 0; i < txt.length; i++) {
    const c = txt[i];
    if (inQ) { if (c === '"') { if (txt[i + 1] === '"') { field += '"'; i++; } else inQ = false; } else field += c; }
    else { if (c === '"') inQ = true; else if (c === ",") { row.push(field); field = ""; } else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; } else if (c === "\r") {} else field += c; }
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows;
}

export function carregarRegras(): Regras {
  return JSON.parse(readFileSync(dataPath("regras_convenio.json"), "utf8"));
}

export function carregarGuias(): GuiaCrua[] {
  const linhas = parseCSV(readFileSync(dataPath("guias.csv"), "utf8"));
  const header = linhas[0];
  return linhas.slice(1).filter((l) => l.length > 1).map((l) => {
    const o: any = {};
    header.forEach((h, i) => (o[h] = (l[i] ?? "").trim()));
    return o as GuiaCrua;
  });
}
