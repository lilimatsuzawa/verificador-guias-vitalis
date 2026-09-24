/* ia.js — leitura da observação da recepção com o modelo Haiku (opcional).
   Só roda quando o usuário cola a própria chave. A chave fica no navegador e vai
   direto pra API da Anthropic; nada é salvo em servidor nosso. A IA só EXTRAI
   sinais estruturados; quem decide continua sendo o motor determinístico. */
(function () {
  var MODELO = "claude-haiku-4-5-20251001"; // Haiku: rápido e barato
  var PROMPT = [
    "Você extrai sinais de uma observação escrita pela recepção de uma clínica, para conferência de guia de convênio.",
    "Responda SOMENTE com um JSON (sem texto antes ou depois, sem crases), neste formato exato:",
    '{"faturarParticular": boolean, "codigoErrado": string|null, "autorizacaoPendente": boolean, "remarcada": boolean}',
    "Definições:",
    "- faturarParticular: o paciente pediu para NÃO usar o convênio / faturar como particular.",
    "- codigoErrado: se a observação diz que o procedimento realizado foi outro (diferente do lançado), devolva o nome citado; senão null.",
    "- autorizacaoPendente: há autorização nova/verbal/por telefone/protocolo, com o número ainda não lançado.",
    "- remarcada: a sessão foi remarcada e a autorização era da data original.",
    "Não invente. Se a observação for irrelevante (ex.: 'trouxe exame', 'chegou atrasado'), tudo é false/null.",
  ].join("\n");

  window.VITALIS_IA = {
    analisar: async function (texto, apiKey) {
      var resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({
          model: MODELO,
          max_tokens: 200,
          messages: [{ role: "user", content: PROMPT + "\n\nObservação:\n" + texto }],
        }),
      });
      if (!resp.ok) throw new Error("HTTP " + resp.status);
      var data = await resp.json();
      var txt = (data.content || []).map(function (b) { return b.text || ""; }).join("").trim();
      txt = txt.replace(/```json/gi, "").replace(/```/g, "").trim();
      var o = JSON.parse(txt);
      return {
        faturarParticular: !!o.faturarParticular,
        codigoErrado: o.codigoErrado || null,
        autorizacaoPendente: !!o.autorizacaoPendente,
        remarcada: !!o.remarcada,
      };
    },
  };
})();
