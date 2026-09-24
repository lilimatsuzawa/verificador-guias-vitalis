// gerar-site.ts — monta docs/index.html (dashboard autossuficiente).
// Empacota o motor (browser.ts) com esbuild e embute as guias, o CSS e a UI.
import * as esbuild from "esbuild";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { carregarGuias } from "../src/dados.js";

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..");
const p = (...s: string[]) => join(RAIZ, ...s);

const bundle = await esbuild.build({
  entryPoints: [p("src/web/browser.ts")],
  bundle: true, format: "iife", write: false, minify: true, loader: { ".json": "json" },
});
const motorJS = bundle.outputFiles[0].text;
const guias = carregarGuias();
const css = readFileSync(p("src/web/estilo.css"), "utf8");
const ui = readFileSync(p("src/web/ui.js"), "utf8");
const ia = readFileSync(p("src/web/ia.js"), "utf8");
const hoje = new Date().toLocaleDateString("pt-BR");

const campo = (id: string, label: string, ph = "") =>
  `<div class="campo"><label>${label}</label><input id="f_${id}" placeholder="${ph}"></div>`;

const html = `<!DOCTYPE html>
<html lang="pt-BR"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Painel de conferência de guias — Clínica Vitalis</title>
<style>${css}</style>
</head><body>
<div class="app">
  <aside class="side">
    <div class="brand">Conferência de guias<small>Clínica Vitalis</small></div>
    <nav class="nav">
      <button data-sec="visao" class="ativo" onclick="irPara('visao')">Visão geral</button>
      <button data-sec="pendencias" onclick="irPara('pendencias')">Pendências <span class="badge-nav" id="nav-pend-badge"></span></button>
      <button data-sec="guias" onclick="irPara('guias')">Guias</button>
      <button data-sec="conferir" onclick="irPara('conferir')">Conferir guia</button>
    </nav>
  </aside>

  <main class="main">
    <div class="topo">
      <h1>Painel de conferência de guias</h1>
      <div class="meta">Período: <b id="periodo">—</b><br>Última atualização: <b id="atualizado">—</b></div>
    </div>

    <!-- VISÃO GERAL -->
    <section class="sec on" id="sec-visao">
      <div class="kpis kpis-3">
        <div class="kpi k-tot" id="k-card-tot"><div class="v" id="k-tot">–</div><div class="l">Guias verificadas</div></div>
        <div class="kpi k-ok" id="k-card-ok"><div class="v" id="k-ok">–</div><div class="l">OK</div></div>
        <div class="kpi k-pend" id="k-card-pend"><div class="v" id="k-pend">–</div><div class="l">Pendentes</div><div class="sub-risco" id="k-risco">–</div></div>
      </div>
      <p class="aviso">Clique em um indicador para ver as guias abaixo.</p>
      <div class="card visao-detalhe" id="visao-detalhe" hidden>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
          <h2 id="visao-detalhe-titulo">Guias</h2>
          <button class="pill" onclick="fecharDetalhe()" style="font-size:11px;padding:3px 10px">✕ Fechar</button>
        </div>
        <table><thead><tr><th>Guia</th><th>Convênio</th><th>Procedimento</th><th>Atend.</th><th class="num">Valor</th><th>Decisão</th><th>Motivos</th></tr></thead>
        <tbody id="visao-linhas"></tbody></table>
      </div>
    </section>

    <!-- PENDÊNCIAS -->
    <section class="sec" id="sec-pendencias">
      <div class="duas">
        <div class="card"><h2>Pendências por tipo</h2>
          <table><thead><tr><th>Tipo</th><th class="num">Guias</th><th class="num">Em risco</th></tr></thead><tbody id="por-tipo"></tbody></table></div>
        <div class="card"><h2>Por convênio</h2>
          <table><thead><tr><th>Convênio</th><th class="num">Pend.</th><th class="num">Em risco</th></tr></thead><tbody id="por-convenio"></tbody></table></div>
      </div>
    </section>

    <!-- GUIAS -->
    <section class="sec" id="sec-guias">
      <div class="card">
        <div class="filtros">
          <div class="grupo" id="pills-status">
            <button class="pill ativo" data-st="TODAS">Todas</button>
            <button class="pill" data-st="PENDENTE">Pendentes</button>
            <button class="pill" data-st="OK">OK</button>
          </div>
          <div class="grupo" id="pills-periodo">
            <button class="pill ativo" data-pd="tudo" onclick="filtroPeriodo('tudo')">Tudo</button>
            <button class="pill" data-pd="30" onclick="filtroPeriodo('30')">Últimos 30 dias</button>
            <button class="pill" data-pd="7" onclick="filtroPeriodo('7')">Últimos 7 dias</button>
          </div>
          <div class="campo"><label>De</label><input type="date" id="f-de"></div>
          <div class="campo"><label>Até</label><input type="date" id="f-ate"></div>
          <div class="campo busca"><label>Buscar</label><input id="f-busca" placeholder="id, convênio, motivo, valor, decisão..."></div>
        </div>
        <h2>Todas as guias (<span id="guias-count">0</span>)</h2>
        <table><thead><tr><th>Guia</th><th>Convênio</th><th>Procedimento</th><th>Atend.</th><th class="num">Valor</th><th>Decisão</th><th>Motivos</th></tr></thead>
        <tbody id="linhas"></tbody></table>
      </div>
    </section>

    <!-- CONFERIR -->
    <section class="sec" id="sec-conferir">
      <div class="card">
        <div class="campo" style="margin-bottom:14px">
          <label>Chave da API Anthropic — opcional, só para testar a leitura por IA (Haiku). Vale para o upload e para a guia avulsa. Fica só no seu navegador, vai direto pra Anthropic. Sem ela, a leitura é determinística.</label>
          <input id="f-apikey" type="password" placeholder="sk-ant-...  (vazio = leitura determinística)">
        </div>
        <div class="modos">
          <button data-modo="upload" class="ativo" onclick="modo('upload')">Upload de CSV (lote)</button>
          <button data-modo="manual" onclick="modo('manual')">Preencher uma guia</button>
        </div>
        <div class="modo on" id="modo-upload">
          <div class="solta">
            <p>Envie um CSV de guias (mesmo formato do lote). Com chave, as observações são lidas por IA.</p>
            <input type="file" accept=".csv" onchange="carregarCSV(this)">
            <p id="upload-msg" class="aviso"></p>
          </div>
        </div>
        <div class="modo" id="modo-manual">
          <div class="grade">
            <div class="campo"><label>Convênio</label><select id="f_convenio"><option>Vitalcard</option><option>Saúde Interior</option><option>Plano Bem</option></select></div>
            <div class="campo"><label>Procedimento</label><select id="f_procedimento_codigo"></select></div>
            ${campo("data_atendimento", "Data do atendimento", "2026-08-20")}
            ${campo("data_lancamento", "Data de lançamento", "2026-08-22")}
            ${campo("carteirinha", "Carteirinha")}
            ${campo("cid", "CID")}
            ${campo("numero_autorizacao", "Nº autorização")}
            ${campo("autorizacao_validade", "Validade autorização", "2026-09-10")}
            ${campo("autorizacao_sessoes_limite", "Limite de sessões")}
            ${campo("sessao_numero_na_autorizacao", "Sessão nº")}
            ${campo("profissional_registro", "Registro profissional", "CREFITO-3 000-F")}
            ${campo("valor", "Valor", "62.00")}
            <textarea id="f_observacao_recepcao" placeholder="Observação da recepção (texto livre)"></textarea>
          </div>
          <div class="acoes"><button class="btn p" onclick="conferir()">Conferir</button><button class="btn s" onclick="exemplo()">Carregar exemplo</button><span id="ia-status" class="aviso"></span></div>
          <div id="res-manual"></div>
        </div>
      </div>
    </section>

    <footer>Painel de conferência de guias · Clínica Vitalis · a mesma lógica roda no lote, no MCP e nesta página. Dados de demonstração fictícios.</footer>
  </main>
</div>

<script id="guias" type="application/json">${JSON.stringify(guias)}</script>
<script>window.GUIAS = JSON.parse(document.getElementById("guias").textContent); window.BUILD_DATE = "${hoje}";</script>
<script>${motorJS}</script>
<script>${ia}</script>
<script>${ui}</script>
</body></html>`;

mkdirSync(p("docs"), { recursive: true });
writeFileSync(p("docs/index.html"), html);
console.log("docs/index.html gerado —", (html.length / 1024).toFixed(0), "KB");
