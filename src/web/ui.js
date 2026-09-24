/* ui.js — dashboard. Usa window.VITALIS (o motor) e window.GUIAS (dados iniciais).
   Nada de regra aqui: so chama verificarGuia e monta a tela. */
(function () {
  var V = window.VITALIS;
  var brl = function (n) { return "R$ " + Number(n).toFixed(2).replace(".", ","); };
  var tag = { regra: "regra", observacao: "obs", dicionario: "dic" };

  var dataset = (window.GUIAS || []).slice();
  var filtroStatus = "TODAS";
  var corrigidas = {}; // id_guia -> true: marcada como corrigida nesta sessão (não persiste)
  function stEfetivo(x) { return (corrigidas[x.g.id_guia] && x.r.decisao === "PENDENTE") ? "CORRIGIDA" : x.r.decisao; }
  function badgeCls(st) { return st === "OK" ? "ok" : (st === "CORRIGIDA" ? "corr" : "pend"); }
  function acaoCorr(st, id) {
    if (st === "PENDENTE") return ' <button class="btn-check" title="Marcar como corrigida" onclick="marcarCorrigida(\'' + id + '\')">✓ corrigida</button>';
    if (st === "CORRIGIDA") return ' <button class="btn-check desfazer" onclick="desmarcarCorrigida(\'' + id + '\')">desfazer</button>';
    return "";
  }
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
    // guia marcada como corrigida deixa de contar como pendência (só nesta sessão)
    var efet = itens.map(function (x) {
      return (corrigidas[x.g.id_guia] && x.r.decisao === "PENDENTE")
        ? Object.assign({}, x.r, { decisao: "OK", problemas: [], valor_em_risco: 0 })
        : x.r;
    });
    var rel = V.gerarRelatorio(efet);
    var nOk = itens.filter(function (x) { return x.r.decisao === "OK"; }).length;
    var nCorr = itens.filter(function (x) { return x.r.decisao === "PENDENTE" && corrigidas[x.g.id_guia]; }).length;

    document.getElementById("k-tot").textContent = rel.total;
    document.getElementById("k-ok").textContent = nOk;
    document.getElementById("k-pend").textContent = rel.pendentes;
    document.getElementById("k-risco").textContent = "em risco: " + brl(rel.valor_em_risco_total);
    var bn = document.getElementById("nav-pend-badge");
    bn.textContent = rel.pendentes; bn.style.display = rel.pendentes ? "" : "none";
    var pc = document.querySelector('#pills-status [data-st="CORRIGIDA"]');
    if (pc) pc.textContent = "Corrigidas" + (nCorr ? " (" + nCorr + ")" : "");

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
      if (filtroStatus !== "TODAS" && stEfetivo(x) !== filtroStatus) return false;
      if (q) {
        var motivosTxt = x.r.problemas.map(function (p) { return p.tipo + " " + p.motivo; }).join(" ");
        var alvo = (x.g.id_guia + " " + x.g.convenio + " " + x.r.procedimento + " " + x.g.data_atendimento + " " + (x.g.valor || "") + " " + stEfetivo(x) + " " + motivosTxt).toLowerCase();
        if (alvo.indexOf(q) < 0) return false;
      }
      return true;
    });
    document.getElementById("guias-count").textContent = linhas.length;
    document.getElementById("linhas").innerHTML = linhas.map(function (x) {
      var st = stEfetivo(x);
      return '<tr><td data-label="Guia">' + x.g.id_guia + '</td><td data-label="Convênio">' + x.g.convenio + '</td><td data-label="Procedimento">' + x.r.procedimento +
        '</td><td data-label="Atend.">' + x.g.data_atendimento + '</td><td data-label="Valor" class="num">' + brl(parseFloat((x.g.valor || "0").replace(",", "."))) +
        '</td><td data-label="Decisão"><span class="badge ' + badgeCls(st) + '">' + st + '</span>' + acaoCorr(st, x.g.id_guia) + '</td><td data-label="Motivos">' + motivos(x.r) + "</td></tr>";
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
      linhas = itens.filter(function (x) { return stEfetivo(x) === filtro; });
    }
    document.getElementById("visao-detalhe-titulo").textContent = titulos[filtro] + " (" + linhas.length + ")";
    document.getElementById("visao-linhas").innerHTML = linhas.map(function (x) {
      var st = stEfetivo(x);
      return '<tr><td data-label="Guia">' + x.g.id_guia + '</td><td data-label="Convênio">' + x.g.convenio + '</td><td data-label="Procedimento">' + x.r.procedimento +
        '</td><td data-label="Atend.">' + x.g.data_atendimento + '</td><td data-label="Valor" class="num">' + brl(parseFloat((x.g.valor || "0").replace(",", "."))) +
        '</td><td data-label="Decisão"><span class="badge ' + badgeCls(st) + '">' + st + '</span>' + acaoCorr(st, x.g.id_guia) + '</td><td data-label="Motivos">' + motivos(x.r) + "</td></tr>";
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

  // ---- validação inline: dica embaixo do campo enquanto digita (o veredito final é do motor) ----
  function _valF(c) { var el = document.getElementById("f_" + c); return el ? (el.value || "").trim() : ""; }
  function _conv() { return V.regras.convenios.find(function (c) { return c.nome === _valF("convenio"); }); }
  function _proc() { return V.regras.procedimentos.find(function (p) { return p.codigo === _valF("procedimento_codigo"); }); }
  function _setErr(c, msg) {
    var e = document.getElementById("err_" + c); if (e) e.textContent = msg || "";
    var inp = document.getElementById("f_" + c); if (inp) inp.classList.toggle("campo-erro", !!msg);
  }
  function validarInline() {
    var c = _conv(), pr = _proc();
    ["data_atendimento", "data_lancamento", "autorizacao_validade"].forEach(function (cc) {
      var v = _valF(cc);
      if (!v) { _setErr(cc, ""); return; }
      var d = V.normalizarData(v);
      if (!d) _setErr(cc, "Data inválida (use AAAA-MM-DD)");
      else if (cc === "data_atendimento" && (d.getUTCFullYear() < 2000 || d.getUTCFullYear() > 2030)) _setErr(cc, "Data fora do período plausível");
      else _setErr(cc, "");
    });
    var v = _valF("valor"), n = parseFloat(v.replace(",", "."));
    _setErr("valor", (v && pr && isFinite(n) && Math.abs(n - pr.valor_referencia) > 0.001) ? "Referência do procedimento: R$ " + pr.valor_referencia.toFixed(2) : "");
    var s = parseInt(_valF("sessao_numero_na_autorizacao"), 10);
    _setErr("sessao_numero_na_autorizacao", (c && isFinite(s) && s > c.limite_sessoes_por_autorizacao) ? "Passa do limite de " + c.limite_sessoes_por_autorizacao + " do " + c.nome : "");
    var lim = parseInt(_valF("autorizacao_sessoes_limite"), 10);
    _setErr("autorizacao_sessoes_limite", (c && isFinite(lim) && lim !== c.limite_sessoes_por_autorizacao) ? "Limite do " + c.nome + " é " + c.limite_sessoes_por_autorizacao : "");
    var reg = _valF("profissional_registro").toUpperCase();
    if (!reg) _setErr("profissional_registro", "");
    else if (pr && pr.codigo.charAt(0) === "5" && reg.indexOf("CREFITO") < 0) _setErr("profissional_registro", "Esperado CREFITO (fisioterapia)");
    else if (pr && (pr.codigo === "20103301" || pr.codigo === "40201015") && reg.indexOf("CRM") < 0) _setErr("profissional_registro", "Esperado CRM (médico)");
    else _setErr("profissional_registro", "");
  }
  window.validarInline = validarInline;
  campos.forEach(function (cc) {
    var inp = document.getElementById("f_" + cc); if (!inp) return;
    var e = document.createElement("small"); e.className = "erro-campo"; e.id = "err_" + cc;
    inp.parentNode.appendChild(e);
    inp.addEventListener("input", validarInline);
    inp.addEventListener("change", validarInline);
  });

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
    if (window.validarInline) window.validarInline();
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

  window.baixarRelatorio = function () {
    var itens = calcular();
    var efet = itens.map(function (x) {
      return (corrigidas[x.g.id_guia] && x.r.decisao === "PENDENTE")
        ? Object.assign({}, x.r, { decisao: "OK", problemas: [], valor_em_risco: 0 }) : x.r;
    });
    var rel = V.gerarRelatorio(efet);
    var pend = itens.filter(function (x) { return stEfetivo(x) === "PENDENTE"; });
    var oks = itens.filter(function (x) { return stEfetivo(x) !== "PENDENTE"; });
    var val = function (g) { return brl(parseFloat((g.valor || "0").replace(",", "."))); };
    var p = periodo();
    var per = p.min ? (p.min.split("-").reverse().join("/") + " a " + p.max.split("-").reverse().join("/")) : "todo o período";
    if (!(window.jspdf && window.jspdf.jsPDF)) { window.print(); return; } // fallback
    var doc = new window.jspdf.jsPDF({ unit: "pt", format: "a4" });
    var M = 42, y = 54;
    doc.setFontSize(16); doc.setTextColor(20, 22, 26);
    doc.text("Relatório de conferência de guias", M, y);
    doc.setFontSize(10); doc.setTextColor(110, 110, 110);
    y += 16; doc.text("Clínica Vitalis", M, y);
    y += 14; doc.text("Período: " + per + "   ·   Gerado em: " + new Date().toLocaleString("pt-BR"), M, y);
    y += 26; doc.setFontSize(12); doc.setTextColor(20, 22, 26);
    doc.text(rel.total + " verificadas     " + rel.ok + " OK     " + rel.pendentes + " pendentes     " + brl(rel.valor_em_risco_total) + " em risco", M, y);
    if (!doc.autoTable) { doc.save("relatorio-conferencia-vitalis.pdf"); return; }
    var cab = { fillColor: [230, 66, 58] };

    doc.autoTable({ startY: y + 18, head: [["Pendência por tipo", "Guias", "Em risco"]],
      body: rel.por_tipo.map(function (t) { return [t.tipo, String(t.quantidade), brl(t.valor_em_risco)]; }),
      styles: { fontSize: 9 }, headStyles: cab, margin: { left: M, right: M } });
    doc.autoTable({ startY: doc.lastAutoTable.finalY + 18, head: [["Convênio", "Pendentes", "Em risco"]],
      body: rel.por_convenio.map(function (c) { return [c.convenio, c.pendentes + "/" + c.total, brl(c.valor_em_risco)]; }),
      styles: { fontSize: 9 }, headStyles: cab, margin: { left: M, right: M } });

    var yp = doc.lastAutoTable.finalY + 26; doc.setFontSize(12); doc.setTextColor(20, 22, 26);
    doc.text("Guias pendentes (" + pend.length + ")", M, yp);
    doc.autoTable({ startY: yp + 6,
      head: [["Guia", "Convênio", "Procedimento", "Valor", "Motivo", "O que corrigir"]],
      body: pend.map(function (x) {
        var b = x.r.problemas.filter(function (p2) { return p2.severidade === "bloqueia"; });
        return [x.g.id_guia, x.g.convenio, x.r.procedimento, val(x.g),
          b.map(function (p2) { return p2.motivo; }).join(" "),
          b.map(function (p2) { return p2.corrigir; }).join(" ")];
      }),
      styles: { fontSize: 8, overflow: "linebreak", cellPadding: 3 }, headStyles: cab, margin: { left: M, right: M },
      columnStyles: { 0: { cellWidth: 62 }, 3: { cellWidth: 42, halign: "right" }, 4: { cellWidth: 118 }, 5: { cellWidth: 130 } } });

    var yo = doc.lastAutoTable.finalY + 26; doc.setFontSize(12); doc.setTextColor(20, 22, 26);
    doc.text("Guias OK (" + oks.length + ")", M, yo);
    doc.autoTable({ startY: yo + 6, head: [["Guia", "Convênio", "Procedimento", "Valor"]],
      body: oks.map(function (x) { return [x.g.id_guia, x.g.convenio, x.r.procedimento, val(x.g)]; }),
      styles: { fontSize: 8, cellPadding: 3 }, headStyles: cab, margin: { left: M, right: M },
      columnStyles: { 3: { halign: "right" } } });

    doc.save("relatorio-conferencia-vitalis.pdf");
  };

  window.marcarCorrigida = function (id) { if (id) corrigidas[id] = true; render(); };
  window.desmarcarCorrigida = function (id) { delete corrigidas[id]; render(); };

  var p0 = periodo(); de = p0.min; ate = p0.max;
  document.getElementById("f-de").value = de; document.getElementById("f-ate").value = ate;
  var kEl = document.getElementById("f-apikey");
  if (kEl) kEl.oninput = function (e) { apiKey = (e.target.value || "").trim(); };
  document.getElementById("atualizado").textContent = window.BUILD_DATE || "";
  sincronizarPills();
  sincronizarPeriodo();
  render();
})();
