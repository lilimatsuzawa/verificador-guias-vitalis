/* ui.js — interface do navegador. Usa window.VITALIS (o motor) e window.GUIAS
   (as 80 guias embutidas). Não decide nada: só chama verificarGuia e mostra. */
(function () {
  var V = window.VITALIS;
  var guias = window.GUIAS || [];
  var brl = function (n) { return "R$ " + Number(n).toFixed(2).replace(".", ","); };
  var tag = { regra: "regra", observacao: "obs", dicionario: "dic" };

  // roda o motor no lote inteiro (ao vivo, no navegador)
  var resultados = guias.map(function (g) { return V.verificarGuia(g, V.regras); });
  var rel = V.gerarRelatorio(resultados);

  // ---- placar ----
  document.getElementById("placar").innerHTML =
    kpi(rel.total, "guias verificadas") +
    kpi(rel.ok, "OK") +
    kpi(rel.pendentes, "pendentes") +
    kpi(brl(rel.valor_em_risco_total), "em risco (amostra ago.)");

  function kpi(v, l) { return '<div class="kpi"><div class="v">' + v + '</div><div class="l">' + l + "</div></div>"; }

  // ---- por tipo ----
  document.getElementById("por-tipo").innerHTML = rel.por_tipo.map(function (t) {
    return "<tr><td>" + t.tipo + "</td><td class=num>" + t.quantidade + "</td><td class=num>" + brl(t.valor_em_risco) + "</td></tr>";
  }).join("");

  // ---- por convênio ----
  document.getElementById("por-convenio").innerHTML = rel.por_convenio.map(function (c) {
    return "<tr><td>" + c.convenio + "</td><td class=num>" + c.pendentes + "/" + c.total + "</td><td class=num>" + brl(c.valor_em_risco) + "</td></tr>";
  }).join("");

  // ---- tabela das 80 ----
  function motivos(r) {
    var b = r.problemas.filter(function (p) { return p.severidade === "bloqueia"; });
    if (!b.length) return "—";
    return b.map(function (p) { return "<span class=chip>[" + tag[V.origemDe(p.tipo)] + "] " + p.tipo + "</span>"; }).join(" ");
  }
  document.getElementById("linhas").innerHTML = resultados.map(function (r, i) {
    var g = guias[i];
    var cls = r.decisao === "OK" ? "ok" : "pend";
    return '<tr data-dec="' + r.decisao + '"><td>' + g.id_guia + "</td><td>" + g.convenio + "</td><td>" + r.procedimento +
      "</td><td>" + g.data_atendimento + "</td><td class=num>" + brl(parseFloat((g.valor || "0").replace(",", "."))) +
      '</td><td><span class="badge ' + cls + '">' + r.decisao + "</span></td><td>" + motivos(r) + "</td></tr>";
  }).join("");

  // ---- filtro da tabela ----
  window.filtrar = function (dec, btn) {
    var linhas = document.querySelectorAll("#linhas tr");
    for (var i = 0; i < linhas.length; i++) {
      linhas[i].style.display = dec === "TODAS" || linhas[i].getAttribute("data-dec") === dec ? "" : "none";
    }
    var botoes = document.querySelectorAll(".filtro button");
    for (var j = 0; j < botoes.length; j++) botoes[j].classList.remove("ativo");
    btn.classList.add("ativo");
  };

  // ---- formulário: conferir uma guia nova ao vivo ----
  var sel = document.getElementById("f_procedimento_codigo");
  V.regras.procedimentos.forEach(function (p) {
    var o = document.createElement("option");
    o.value = p.codigo; o.textContent = p.codigo + " — " + p.descricao; sel.appendChild(o);
  });

  var campos = ["convenio", "procedimento_codigo", "data_atendimento", "carteirinha", "cid",
    "numero_autorizacao", "autorizacao_validade", "autorizacao_sessoes_limite",
    "sessao_numero_na_autorizacao", "profissional_registro", "valor", "data_lancamento", "observacao_recepcao"];

  window.conferir = function () {
    var g = {};
    campos.forEach(function (c) { g[c] = (document.getElementById("f_" + c).value || "").trim(); });
    var r = V.verificarGuia(g, V.regras);
    var cls = r.decisao === "OK" ? "ok" : "pend";
    var html = '<div class="res ' + cls + '"><div class="res-top"><span class="badge ' + cls + '">' + r.decisao +
      "</span> <b>" + (r.procedimento || "") + "</b> · " + brl(r.valor_em_risco) + " em risco</div>";
    if (!r.problemas.length) html += "<p>Guia pronta para envio.</p>";
    else html += "<ul>" + r.problemas.map(function (p) {
      return "<li><b>" + p.tipo + "</b> [" + tag[V.origemDe(p.tipo)] + "] — " + p.motivo + "<br><i>Corrigir:</i> " + p.corrigir + "</li>";
    }).join("") + "</ul>";
    html += "</div>";
    document.getElementById("resultado").innerHTML = html;
  };

  window.exemplo = function () {
    var ex = {
      convenio: "Vitalcard", procedimento_codigo: "20103301", data_atendimento: "2026-08-12",
      carteirinha: "445566", cid: "M25.5", numero_autorizacao: "AUT909", autorizacao_validade: "2026-09-05",
      autorizacao_sessoes_limite: "10", sessao_numero_na_autorizacao: "2", profissional_registro: "CRM-SP 55010",
      valor: "90.00", data_lancamento: "2026-08-14",
      observacao_recepcao: "Procedimento realizado foi drenagem linfática, lançar o código certo.",
    };
    campos.forEach(function (c) { document.getElementById("f_" + c).value = ex[c] || ""; });
    window.conferir();
  };
})();
