// gerar-site.ts — monta docs/index.html autossuficiente.
// Empacota o motor (browser.ts) com esbuild, embute as 80 guias, o CSS e a UI.
// O mesmo motor que roda no lote e no MCP roda aqui, no navegador.
import * as esbuild from "esbuild";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { carregarGuias } from "../src/dados.js";

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..");
const p = (...s: string[]) => join(RAIZ, ...s);

// 1. empacota o motor para o navegador (IIFE, com o JSON das regras embutido)
const bundle = await esbuild.build({
  entryPoints: [p("src/web/browser.ts")],
  bundle: true, format: "iife", write: false, minify: true,
  loader: { ".json": "json" },
});
const motorJS = bundle.outputFiles[0].text;

// 2. dados e recursos
const guias = carregarGuias();
const css = readFileSync(p("src/web/estilo.css"), "utf8");
const ui = readFileSync(p("src/web/ui.js"), "utf8");

// 3. HTML autossuficiente
const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Conferência de guias — Clínica Vitalis</title>
<style>${css}</style>
</head>
<body>
<div class="wrap">
  <header>
    <h1>Conferência de guias de convênio — Clínica Vitalis</h1>
    <p>Lote de agosto/2026 · conferência antes do envio ao convênio · dados fictícios</p>
  </header>

  <section class="card">
    <h2>Relatório de terça — Dr. Renato</h2>
    <div class="placar" id="placar"></div>
  </section>

  <div class="duas">
    <section class="card"><h2>Pendências por tipo</h2>
      <table><thead><tr><th>Tipo</th><th class="num">Guias</th><th class="num">Em risco</th></tr></thead>
      <tbody id="por-tipo"></tbody></table>
    </section>
    <section class="card"><h2>Por convênio</h2>
      <table><thead><tr><th>Convênio</th><th class="num">Pend.</th><th class="num">Em risco</th></tr></thead>
      <tbody id="por-convenio"></tbody></table>
    </section>
  </div>

  <section class="card">
    <h2>Conferir uma guia nova</h2>
    <div class="grade">
      <div><label>Convênio</label><select id="f_convenio"><option>Vitalcard</option><option>Saúde Interior</option><option>Plano Bem</option></select></div>
      <div><label>Procedimento</label><select id="f_procedimento_codigo"></select></div>
      <div><label>Data do atendimento</label><input id="f_data_atendimento" placeholder="2026-08-20"></div>
      <div><label>Data de lançamento</label><input id="f_data_lancamento" placeholder="2026-08-22"></div>
      <div><label>Carteirinha</label><input id="f_carteirinha"></div>
      <div><label>CID</label><input id="f_cid"></div>
      <div><label>Nº autorização</label><input id="f_numero_autorizacao"></div>
      <div><label>Validade autorização</label><input id="f_autorizacao_validade" placeholder="2026-09-10"></div>
      <div><label>Limite de sessões</label><input id="f_autorizacao_sessoes_limite"></div>
      <div><label>Sessão nº</label><input id="f_sessao_numero_na_autorizacao"></div>
      <div><label>Registro profissional</label><input id="f_profissional_registro" placeholder="CREFITO-3 000-F"></div>
      <div><label>Valor</label><input id="f_valor" placeholder="62.00"></div>
      <textarea id="f_observacao_recepcao" placeholder="Observação da recepção (texto livre)"></textarea>
    </div>
    <div class="acoes">
      <button class="btn p" onclick="conferir()">Conferir</button>
      <button class="btn s" onclick="exemplo()">Carregar exemplo</button>
    </div>
    <div id="resultado"></div>
  </section>

  <section class="card">
    <h2>As 80 guias</h2>
    <div class="filtro">
      <button class="ativo" onclick="filtrar('TODAS',this)">Todas</button>
      <button onclick="filtrar('PENDENTE',this)">Pendentes</button>
      <button onclick="filtrar('OK',this)">OK</button>
    </div>
    <table><thead><tr><th>Guia</th><th>Convênio</th><th>Procedimento</th><th>Atend.</th><th class="num">Valor</th><th>Decisão</th><th>Motivos</th></tr></thead>
    <tbody id="linhas"></tbody></table>
  </section>

  <footer>Conferência de guias · Clínica Vitalis · a mesma lógica roda no lote, no MCP e nesta página.</footer>
</div>

<script id="guias" type="application/json">${JSON.stringify(guias)}</script>
<script>window.GUIAS = JSON.parse(document.getElementById("guias").textContent);</script>
<script>${motorJS}</script>
<script>${ui}</script>
</body>
</html>`;

mkdirSync(p("docs"), { recursive: true });
writeFileSync(p("docs/index.html"), html);
console.log("docs/index.html gerado —", (html.length / 1024).toFixed(0), "KB");
