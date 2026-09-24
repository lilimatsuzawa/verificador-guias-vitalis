/* ui.js — dashboard. Usa window.VITALIS (o motor) e window.GUIAS (dados iniciais).
   Nada de regra aqui: so chama verificarGuia e monta a tela. */
(function () {
  var V = window.VITALIS;
  var brl = function (n) { return "R$ " + Number(n).toFixed(2).replace(".", ","); };
  var tag = { regra: "regra", observacao: "obs", dicionario: "dic" };

  var dataset = (window.GUIAS || []).slice();
  var filtroStatus = "TODAS";
  var busca = "";
  var de = "", ate = "";
  var apiKey = "";
  var sinaisPorGuia = {}; // id_guia -> sinais lidos pela IA (Haiku), quando houver chave

  var iso = function (s) { var d = V.normalizarData(s); return d ? d.toISOString().slice(0, 10) : ""; };

  function periodo() {
    var ds = dataset.map(function (g) { return iso(g.data_atendimento); }).filter(Boolean).sort();
    return ds.length ? { min: ds[0], max: ds[ds.length - 1] } : { min: "", max: "" };
  }

  function calcular() {
    return dataset
      .filter(function (g) {
        var d = iso(g.data_atendimento);
        if (de && d && d < de) return false;
        if (ate && d && d > ate) return false;
        return true;
      })
      .map(function (g) { return { g: g, r: V.verificarGuia(g, V.regras, sinaisPorGuia[g.id_guia]) }; });
  }

  function motivos(r) {
    var b = r.problemas.filter(function (p) { return p.severidade === "bloqueia"; });
    if (!b.length) return "—";
    return b.map(function (p) { return '<span class="chip">[' + tag[V.origemDe(p.tipo)] + "] " + p.tipo + "</span>"; }).join(" ");
  }

  function render() {
    var itens = calcular();
    var rel = V.gerarRelatorio(itens.map(function (x) { return x.r; }));

    document.getElementById("k-tot").textContent = rel.total;
    document.getElementById("k-ok").textContent = rel.ok;
    document.getElementById("k-pend").textContent = rel.pendentes;
    document.getElementById("k-risco").textContent = "em risco: " + brl(rel.valor_em_risco_total);
    var bn = document.getElementById("nav-pend-badge");
    bn.textContent = rel.pendentes; bn.style.display = rel.pendentes ? "" : "none";

    rel.por_tipo.sort(function (a, b) { return b.valor_em_risco - a.valor_em_risco; });
    var maxTipo = Math.max.apply(null, rel.por_tipo.map(function (t) { return t.valor_em_risco; }).concat([1]));
    document.getElementById("por-tipo").innerHTML = rel.por_tipo.map(function (t, i) {
      var ratio = t.valor_em_risco / maxTipo;
      var r = Math.round(220 - ratio * 100);
      var g = Math.round(60 - ratio * 40);
      var b2 = Math.round(60 - ratio * 40);
      var cor = "rgb(" + r + "," + g + "," + b2 + ")";
      return '<tr><td data-label="Tipo">' + t.tipo + '<div class="bar" style="width:' + Math.round(ratio * 100) +
        "%;background:" + cor + '"></div></td><td data-label="Guias" class="num">' + t.quantidade + '</td><td data-label="Em risco" class="num risco-val">' + brl(t.valor_em_risco) + "</td></tr>";
    }).join("") || '<tr><td colspan="3">Sem pendencias no periodo.</td></tr>';

    rel.por_convenio.sort(function (a, b) { return b.valor_em_risco - a.valor_em_risco; });
    document.getElementById("por-convenio").innerHTML = rel.por_convenio.map(function (c) {
      return '<tr><td data-label="Convênio">' + c.convenio + '</td><td data-label="Pend." class="num">' + c.pendentes + "/" + c.total +
        '</td><td data-label="Em risco" class="num risco-val">' + brl(c.valor_em_risco) + "</td></tr>";
    }).join("");

    var q = busca.toLowerCase();
    var linhas = itens.filter(function (x) {
      if (filtroStatus !== "TODAS" && x.r.decisao !== filtroStatus) return false;
      if (q) {
        var motivosTxt = x.r.problemas.map(function (p) { return p.tipo + " " + p.motivo; }).join(" ");
        var alvo = (x.g.id_guia + " " + x.g.convenio + " " + x.r.procedimento + " " + x.g.data_atendimento + " " + (x.g.valor || "") + " " + x.r.decisao + " " + motivosTxt).toLowerCase();
        if (alvo.indexOf(q) < 0) return false;
      }
      return true;
    });
    document.getElementById("guias-count").textContent = linhas.length;
    document.getElementById("linhas").innerHTML = linhas.map(function (x) {
      var cls = x.r.decisao === "OK" ? "ok" : "pend";
      return '<tr><td data-label="Guia">' + x.g.id_guia + '</td><td data-label="Convênio">' + x.g.convenio + '</td><td data-label="Procedimento">' + x.r.procedimento +
        '</td><td data-label="Atend.">' + x.g.data_atendimento + '</td><td data-label="Valor" class="num">' + brl(parseFloat((x.g.valor || "0").replace(",", "."))) +
        '</td><td data-label="Decisão"><span class="badge ' + cls + '">' + x.r.decisao + '</span></td><td data-label="Motivos">' + motivos(x.r) + "</td></tr>";
    }).join("") || '<tr><td colspan="7">Nenhuma guia com esses filtros.</td></tr>';

    var p = periodo();
    document.getElementById("periodo").textContent = p.min ? (p.min.split("-").reverse().join("/") + " a " + p.max.split("-").reverse().join("/")) : "—";

    if (detalheAberto) renderDetalhe(detalheAberto);
  }

  window.irPara = function (sec, statusOpcional) {
    document.querySelectorAll(".sec").forEach(function (s) { s.classList.remove("on"); });
    document.getElementById("sec-" + sec).classList.add("on");
    document.querySelectorAll(".nav button").forEach(function (b) { b.classList.toggle("ativo", b.getAttribute("data-sec") === sec); });
    if (statusOpcional) { filtroStatus = statusOpcional; sincronizarPills(); render(); }
  };

  function sincronizarPills() {
    document.querySelectorAll("#pills-status .pill").forEach(function (b) { b.classList.toggle("ativo", b.getAttribute("data-st") === filtroStatus); });
  }

  var detalheAberto = "";
  var titulos = { TODAS: "Todas as guias", OK: "Guias OK", PENDENTE: "Guias pendentes" };

  function renderDetalhe(filtro) {
    var itens = calcular();
    var linhas;
    if (filtro === "TODAS") {
      linhas = itens;
    } else {
      linhas = itens.filter(function (x) { return x.r.decisao === filtro; });
    }
    document.getElementById("visao-detalhe-titulo").textContent = titulos[filtro] + " (" + linhas.length + ")";
    document.getElementById("visao-linhas").innerHTML = linhas.map(function (x) {
      var cls = x.r.decisao === "OK" ? "ok" : "pend";
      return '<tr><td data-label="Guia">' + x.g.id_guia + '</td><td data-label="Convênio">' + x.g.convenio + '</td><td data-label="Procedimento">' + x.r.procedimento +
        '</td><td data-label="Atend.">' + x.g.data_atendimento + '</td><td data-label="Valor" class="num">' + brl(parseFloat((x.g.valor || "0").replace(",", "."))) +
        '</td><td data-label="Decisão"><span class="badge ' + cls + '">' + x.r.decisao + '</span></td><td data-label="Motivos">' + motivos(x.r) + "</td></tr>";
    }).join("") || '<tr><td colspan="7">Nenhuma guia.</td></tr>';
  }

  function toggleDetalhe(filtro) {
    var el = document.getElementById("visao-detalhe");
    document.querySelectorAll(".kpi").forEach(function (k) { k.classList.remove("kpi-ativo"); });
    if (detalheAberto === filtro) { el.hidden = true; detalheAberto = ""; return; }
    detalheAberto = filtro;
    renderDetalhe(filtro);
    el.hidden = false;
    el.className = "card visao-detalhe";
    var corMapa = { TODAS: "cor-tot", OK: "cor-ok", PENDENTE: "cor-pend" };
    el.classList.add(corMapa[filtro]);
    var mapa = { TODAS: "k-card-tot", OK: "k-card-ok", PENDENTE: "k-card-pend" };
    document.getElementById(mapa[filtro]).classList.add("kpi-ativo");
    el.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  window.fecharDetalhe = function () { document.getElementById("visao-detalhe").hidden = true; detalheAberto = ""; document.querySelectorAll(".kpi").forEach(function (k) { k.classList.remove("kpi-ativo"); }); };

  document.getElementById("k-card-tot").onclick = function () { toggleDetalhe("TODAS"); };
  document.getElementById("k-card-ok").onclick = function () { toggleDetalhe("OK"); };
  document.getElementById("k-card-pend").onclick = function () { toggleDetalhe("PENDENTE"); };

  document.querySelectorAll("#pills-status .pill").forEach(function (b) {
    b.onclick = function () { filtroStatus = b.getAttribute("data-st"); sincronizarPills(); render(); };
  });
  document.getElementById("f-busca").oninput = function (e) { busca = e.target.value; render(); };
  document.getElementById("f-de").onchange = function (e) { de = e.target.value; sincronizarPeriodo(); render(); };
  document.getElementById("f-ate").onchange = function (e) { ate = e.target.value; sincronizarPeriodo(); render(); };

  function isoHoje() { return new Date().toISOString().slice(0, 10); }
  function isoDiasAtras(n) { var d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); }

  function sincronizarPeriodo() {
    document.querySelectorAll("#pills-periodo .pill").forEach(function (b) { b.classList.remove("ativo"); });
    var p0 = periodo();
    if (de === p0.min && ate === p0.max) { var el = document.querySelector('#pills-periodo .pill[data-pd="tudo"]'); if (el) el.classList.add("ativo"); }
    else if (de === isoDiasAtras(30) && ate === isoHoje()) { var el = document.querySelector('#pills-periodo .pill[data-pd="30"]'); if (el) el.classList.add("ativo"); }
    else if (de === isoDiasAtras(7) && ate === isoHoje()) { var el = document.querySelector('#pills-periodo .pill[data-pd="7"]'); if (el) el.classList.add("ativo"); }
  }

  window.filtroPeriodo = function (pd) {
    var p0 = periodo();
    if (pd === "tudo") { de = p0.min; ate = p0.max; }
    else if (pd === "30") { de = isoDiasAtras(30); ate = isoHoje(); }
    else if (pd === "7") { de = isoDiasAtras(7); ate = isoHoje(); }
    document.getElementById("f-de").value = de;
    document.getElementById("f-ate").value = ate;
    sincronizarPeriodo();
    render();
  };

  window.modo = function (m) {
    document.querySelectorAll(".modo").forEach(function (x) { x.classList.remove("on"); });
    document.getElementById("modo-" + m).classList.add("on");
    document.querySelectorAll(".modos button").forEach(function (b) { b.classList.toggle("ativo", b.getAttribute("data-modo") === m); });
  };

  var campos = ["convenio", "procedimento_codigo", "data_atendimento", "data_lancamento", "carteirinha", "cid",
    "numero_autorizacao", "autorizacao_validade", "autorizacao_sessoes_limite", "sessao_numero_na_autorizacao",
    "profissional_registro", "valor", "observacao_recepcao"];

  var selProc = document.getElementById("f_procedimento_codigo");
  V.regras.procedimentos.forEach(function (p) { var o = document.createElement("option"); o.value = p.codigo; o.textContent = p.codigo + " - " + p.descricao; selProc.appendChild(o); });

  function mostrarResultado(r, alvo, nota) {
    var cls = r.decisao === "OK" ? "ok" : "pend";
    var html = '<div class="res ' + cls + '"><b><span class="badge ' + cls + '">' + r.decisao + "</span> " + (r.procedimento || "") + "</b> - " + brl(r.valor_em_risco) + " em risco";
    if (!r.problemas.length) html += "<p>Guia pronta para envio.</p>";
    else html += "<ul>" + r.problemas.map(function (p) { return "<li><b>" + p.tipo + "</b> [" + tag[V.origemDe(p.tipo)] + "] - " + p.motivo + "<br><i>Corrigir:</i> " + p.corrigir + "</li>"; }).join("") + "</ul>";
    if (nota) html += '<p class="aviso">' + nota + "</p>";
    html += "</div>";
    document.getElementById(alvo).innerHTML = html;
  }

  window.conferir = async function () {
    var g = {}; campos.forEach(function (c) { g[c] = (document.getElementById("f_" + c).value || "").trim(); });
    var sinais = null, nota = "";
    var status = document.getElementById("ia-status");
    if (apiKey && g.observacao_recepcao) {
      if (status) status.textContent = "Lendo a observação com Haiku...";
      try { sinais = await window.VITALIS_IA.analisar(g.observacao_recepcao, apiKey); nota = "Observação lida por IA (Haiku)."; }
      catch (e) { nota = "IA indisponível (" + e.message + "); usei a leitura determinística."; }
      if (status) status.textContent = "";
    } else if (g.observacao_recepcao) {
      nota = "Observação lida de forma determinística. Cole sua chave acima para leitura por IA.";
    }
    mostrarResultado(V.verificarGuia(g, V.regras, sinais || undefined), "res-manual", nota);
  };
  window.exemplo = function () {
    var ex = { convenio: "Vitalcard", procedimento_codigo: "20103301", data_atendimento: "2026-08-12", data_lancamento: "2026-08-14",
      carteirinha: "445566", cid: "M25.5", numero_autorizacao: "AUT909", autorizacao_validade: "2026-09-05",
      autorizacao_sessoes_limite: "10", sessao_numero_na_autorizacao: "2", profissional_registro: "CRM-SP 55010", valor: "90.00",
      observacao_recepcao: "Procedimento realizado foi drenagem linfatica, lancar o codigo certo." };
    campos.forEach(function (c) { document.getElementById("f_" + c).value = ex[c] || ""; });
    window.conferir();
  };

  function parseCSV(txt) {
    var rows = [], field = "", row = [], q = false;
    for (var i = 0; i < txt.length; i++) { var c = txt[i];
      if (q) { if (c === '"') { if (txt[i + 1] === '"') { field += '"'; i++; } else q = false; } else field += c; }
      else { if (c === '"') q = true; else if (c === ",") { row.push(field); field = ""; } else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; } else if (c === "\r") {} else field += c; } }
    if (field !== "" || row.length) { row.push(field); rows.push(row); }
    return rows;
  }
  function confetes() {
    var cores = ["#12805c", "#2b5cff", "#e0362c", "#b7791f", "#9333ea", "#f59e0b"];
    var container = document.createElement("div");
    container.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:9999;overflow:hidden";
    document.body.appendChild(container);
    for (var i = 0; i < 80; i++) {
      var c = document.createElement("div");
      var size = 6 + Math.random() * 6;
      c.style.cssText = "position:absolute;top:-10px;width:" + size + "px;height:" + (size * 0.6) + "px;background:" + cores[Math.floor(Math.random() * cores.length)] +
        ";left:" + Math.random() * 100 + "%;opacity:0.9;border-radius:2px;animation:confete " + (1.5 + Math.random() * 2) + "s ease-out forwards;animation-delay:" + (Math.random() * 0.5) + "s;transform:rotate(" + Math.random() * 360 + "deg)";
      container.appendChild(c);
    }
    setTimeout(function () { container.remove(); }, 4500);
  }

  var modoUpload = "substituir";
  window.escolherModoUpload = function (m, btn) {
    modoUpload = m;
    document.querySelectorAll("#pills-upload .pill").forEach(function (b) { b.classList.remove("ativo"); });
    if (btn) btn.classList.add("ativo");
  };

  window.carregarCSV = async function (input) {
    var f = input.files && input.files[0]; if (!f) return;
    var msg = document.getElementById("upload-msg");
    msg.className = "aviso";
    var espera = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
    var placar = function (extra) {
      var rel = V.gerarRelatorio(calcular().map(function (x) { return x.r; }));
      msg.className = "upload-ok";
      msg.innerHTML = rel.total + " guias · " + rel.ok + " OK · " + rel.pendentes + " pendentes" +
        (extra || "") + ' <button class="btn s" style="margin-left:10px" onclick="irPara(\'visao\')">Ver no painel</button>';
      confetes();
    };
    msg.textContent = "Lendo " + f.name + "...";
    var fr = new FileReader();
    fr.onload = async function () {
      try {
        var linhas = parseCSV(String(fr.result));
        var head = linhas[0].map(function (h) { return h.trim(); });
        var novas = linhas.slice(1).filter(function (l) { return l.length > 1; }).map(function (l) { var o = {}; head.forEach(function (h, i) { o[h] = (l[i] || "").trim(); }); return o; });
        if (!novas.length || head.indexOf("convenio") < 0) throw new Error("CSV sem as colunas esperadas (ex.: convenio, procedimento_codigo).");
        msg.textContent = novas.length + " guias lidas. Conferindo...";
        await espera(400);

        var resumoAdd = "";
        if (modoUpload === "adicionar") {
          var existentes = {}; dataset.forEach(function (g) { if (g.id_guia) existentes[g.id_guia] = true; });
          var aAdicionar = novas.filter(function (g) { return !(g.id_guia && existentes[g.id_guia]); });
          var ignoradas = novas.length - aAdicionar.length;
          dataset = dataset.concat(aAdicionar);
          novas = aAdicionar; // só as adicionadas passam pela leitura por IA
          resumoAdd = " · +" + aAdicionar.length + " adicionadas" + (ignoradas ? " (" + ignoradas + " já no painel, ignoradas)" : "");
        } else {
          dataset = novas; sinaisPorGuia = {};
        }
        de = ""; ate = ""; filtroStatus = "TODAS"; sincronizarPills();
        render(); // atualiza o painel em segundo plano; a tela continua no Upload

        if (!apiKey) { placar(resumoAdd + " · leitura determinística"); return; }
        // Leitura por IA (Haiku): só nas guias novas com observação, com teto, recalculando ao vivo.
        var TETO = 25;
        var comObs = novas.filter(function (g) { return (g.observacao_recepcao || "").trim() && (g.id_guia || "").trim(); });
        var alvo = comObs.slice(0, TETO);
        if (!alvo.length) { placar(resumoAdd); return; }
        for (var i = 0; i < alvo.length; i++) {
          msg.textContent = "Lendo observações com Haiku... " + (i + 1) + "/" + alvo.length;
          try { sinaisPorGuia[alvo[i].id_guia] = await window.VITALIS_IA.analisar(alvo[i].observacao_recepcao, apiKey); }
          catch (e) { /* essa guia fica na leitura determinística */ }
          render();
        }
        var extra = resumoAdd + (comObs.length > TETO ? " · " + alvo.length + " obs. lidas por IA (teto " + TETO + ")" : " · " + alvo.length + " obs. lidas por IA");
        placar(extra);
      } catch (e) { msg.textContent = "Erro ao ler o CSV: " + e.message; }
    };
    fr.readAsText(f);
  };

  var p0 = periodo(); de = p0.min; ate = p0.max;
  document.getElementById("f-de").value = de; document.getElementById("f-ate").value = ate;
  var kEl = document.getElementById("f-apikey");
  if (kEl) kEl.oninput = function (e) { apiKey = (e.target.value || "").trim(); };
  document.getElementById("atualizado").textContent = window.BUILD_DATE || "";
  sincronizarPills();
  sincronizarPeriodo();
  render();
})();
