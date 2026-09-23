// ============================================================================
// nucleo.ts — motor de verificação de guias de convênio (Clínica Vitalis)
//
// Princípio de projeto (o argumento da entrevista):
//   - A REGRA decide. O veredito de cada guia sai de código determinístico e
//     auditável, comparando os campos da guia com regras_convenio.json.
//   - A IA (aqui, analisarObservacao) só LÊ o texto livre da recepção e devolve
//     SINAIS ESTRUTURADOS. Ela nunca dá o veredito; só entrega ao motor o que
//     "só se entende lendo". Onde a nota deixa dúvida, o motor cai em PENDENTE.
//   - Nada é inventado: o que não dá pra verificar com os dados de agosto
//     (ex.: validade_maxima_autorizacao_dias, que precisaria da data de emissão)
//     é explicitamente NÃO verificado, pra não gerar falso positivo.
// ============================================================================

// ----------------------------------------------------------------------------
// Tipos
// ----------------------------------------------------------------------------
export interface Procedimento {
  codigo: string;
  descricao: string;
  valor_referencia: number;
}
export interface Convenio {
  nome: string;
  campos_obrigatorios: string[];
  validade_maxima_autorizacao_dias: number;
  limite_sessoes_por_autorizacao: number;
  procedimentos_cobertos: string[];
  prazo_envio_dias: number;
  observacao: string;
}
export interface Regras {
  versao: string;
  procedimentos: Procedimento[];
  convenios: Convenio[];
}

// Guia crua, do jeito que sai do CSV (tudo string).
export interface GuiaCrua {
  id_guia: string;
  unidade: string;
  data_atendimento: string;
  paciente: string;
  convenio: string;
  carteirinha: string;
  cid: string;
  procedimento_codigo: string;
  procedimento_descricao: string;
  numero_autorizacao: string;
  autorizacao_validade: string;
  autorizacao_sessoes_limite: string;
  sessao_numero_na_autorizacao: string;
  profissional: string;
  profissional_registro: string;
  valor: string;
  observacao_recepcao: string;
  data_lancamento: string;
}

export type Severidade = "bloqueia" | "aviso";
export interface Problema {
  tipo: string;
  motivo: string;       // o que está errado, em linguagem da recepção
  corrigir: string;     // o que fazer pra resolver
  severidade: Severidade;
}
export type Decisao = "OK" | "PENDENTE";
export interface Resultado {
  id_guia: string;
  convenio: string;
  procedimento: string;
  decisao: Decisao;
  problemas: Problema[];
  valor_em_risco: number; // valor da guia se ela tem problema que bloqueia; senão 0
}

// ----------------------------------------------------------------------------
// Normalização — a armadilha de qualidade de dado
// ----------------------------------------------------------------------------

/** Datas vêm em AAAA-MM-DD, "salvo quando a recepção digitou diferente" (dd/mm/aaaa).
 *  Normalizar ANTES de comparar. Sem isso, uma dd/mm/aaaa vira prazo fantasma. */
export function normalizarData(s: string): Date | null {
  const v = (s || "").trim();
  if (!v) return null;
  // monta a data e confirma que dia/mês existem de verdade (rejeita 32/13/2026)
  const montar = (ano: number, mes: number, dia: number): Date | null => {
    const d = new Date(Date.UTC(ano, mes - 1, dia));
    return d.getUTCFullYear() === ano && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia ? d : null;
  };
  let m: RegExpMatchArray | null;
  if ((m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/))) return montar(+m[1], +m[2], +m[3]);
  if ((m = v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/))) return montar(+m[3], +m[2], +m[1]); // dd/mm/aaaa
  return null; // formato desconhecido -> tratado como não verificável
}

export function diasEntre(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

/** Valor pode vir "62,00" (vírgula decimal) ou "62.00". */
export function parseValor(s: string): number | null {
  const v = (s || "").trim().replace(/\./g, "").replace(",", ".");
  // remove separador de milhar simples; para estes dados basta trocar vírgula por ponto:
  const direto = (s || "").trim().replace(",", ".");
  const n = Number(direto);
  return Number.isFinite(n) ? n : null;
}

// ----------------------------------------------------------------------------
// Camada de IA (aqui simulada por padrões; em produção é uma chamada ao LLM
// que devolve exatamente este JSON de sinais). Ela NÃO decide — só extrai.
// ----------------------------------------------------------------------------
export interface SinaisObservacao {
  faturarParticular: boolean;        // "pediu pra faturar como particular"
  codigoErrado: string | null;       // procedimento real informado ≠ lançado
  autorizacaoPendente: boolean;      // autorização nova/verbal, número ainda não lançado
  remarcada: boolean;                // sessão remarcada, autorização da data original
}

export function analisarObservacao(texto: string): SinaisObservacao {
  const t = (texto || "").toLowerCase();
  const sinais: SinaisObservacao = {
    faturarParticular: false,
    codigoErrado: null,
    autorizacaoPendente: false,
    remarcada: false,
  };
  if (!t) return sinais;

  if (/faturar como particular|não quer usar o convênio|nao quer usar o convenio/.test(t))
    sinais.faturarParticular = true;

  // "procedimento realizado foi X, lançar o código certo"
  const mCod = t.match(/procedimento (?:realizado )?foi ([^,.;]+)/);
  if (mCod && /c[oó]digo certo|c[oó]digo errado|lan[çc]ar o c[oó]digo/.test(t))
    sinais.codigoErrado = mCod[1].trim();

  if (/aguardando n[uú]mero|n[uú]mero ainda não lançado|numero ainda nao lancado|autorizado por telefone|autoriza[çc][ãa]o nova|autoriza[çc][ãa]o verbal|protocolo/.test(t))
    sinais.autorizacaoPendente = true;

  if (/remarcad|autoriza[çc][ãa]o era da data original/.test(t)) sinais.remarcada = true;

  return sinais;
}

// ----------------------------------------------------------------------------
// Motor de verificação — uma guia contra as regras
// ----------------------------------------------------------------------------
export function verificarGuia(g: GuiaCrua, regras: Regras): Resultado {
  const problemas: Problema[] = [];
  const add = (tipo: string, motivo: string, corrigir: string, severidade: Severidade = "bloqueia") =>
    problemas.push({ tipo, motivo, corrigir, severidade });

  const proc = regras.procedimentos.find((p) => p.codigo === g.procedimento_codigo);
  const conv = regras.convenios.find((c) => c.nome === g.convenio);
  const sig = analisarObservacao(g.observacao_recepcao);
  const procNome = proc ? proc.descricao : g.procedimento_descricao || g.procedimento_codigo;

  // --- Sinal: faturar como particular. Reclassifica: não confere contra convênio. ---
  if (sig.faturarParticular) {
    add(
      "RECLASSIFICAR_PARTICULAR",
      "Recepção anotou que o paciente pediu para faturar como particular.",
      "Retirar do lote de convênio e faturar como particular; não enviar esta guia ao convênio.",
    );
    const valor = parseValor(g.valor) ?? 0;
    return { id_guia: g.id_guia, convenio: g.convenio, procedimento: procNome, decisao: "PENDENTE", problemas, valor_em_risco: valor };
  }

  if (!conv) {
    add("CONVENIO_DESCONHECIDO", `Convênio "${g.convenio}" não está nas regras.`, "Conferir o nome do convênio na guia.");
    const valor = parseValor(g.valor) ?? 0;
    return { id_guia: g.id_guia, convenio: g.convenio, procedimento: procNome, decisao: "PENDENTE", problemas, valor_em_risco: valor };
  }

  // --- Sinal: código errado (a nota denuncia o que os campos escondem) ---
  if (sig.codigoErrado) {
    add(
      "CODIGO_ERRADO",
      `Recepção anotou que o procedimento foi "${sig.codigoErrado}", diferente do lançado (${procNome}).`,
      "Corrigir o código do procedimento para o que foi realmente realizado antes de enviar.",
    );
  }

  if (!proc) {
    add("PROCEDIMENTO_DESCONHECIDO", `Procedimento ${g.procedimento_codigo} não está na tabela.`, "Conferir o código do procedimento.");
  }

  // --- 1. Cobertura: o convênio cobre este procedimento? ---
  if (proc && !conv.procedimentos_cobertos.includes(g.procedimento_codigo)) {
    const particular = /consulta/i.test(proc.descricao) && /não cobre|nao cobre/i.test(conv.observacao);
    add(
      "PROCEDIMENTO_NAO_COBERTO",
      `${conv.nome} não cobre ${proc.descricao}.`,
      particular ? "Faturar como particular (o convênio não cobre consulta)." : "Conferir cobertura; provavelmente faturar como particular.",
    );
  }

  // --- 2. Campos obrigatórios do convênio ---
  const faltantes = conv.campos_obrigatorios.filter((campo) => !((g as any)[campo] || "").trim());
  // Exceção: número de autorização em falta, MAS a nota diz que está pendente (verbal/nova).
  const idxAut = faltantes.indexOf("numero_autorizacao");
  if (idxAut >= 0 && sig.autorizacaoPendente) {
    faltantes.splice(idxAut, 1);
    const verbalOk = /verbal|telefone|protocolo/i.test(conv.observacao); // Saúde Interior aceita
    add(
      "AUTORIZACAO_PENDENTE",
      "Autorização informada na observação, mas o número ainda não foi lançado.",
      verbalOk
        ? "Lançar o número da autorização antes de enviar (o convênio aceita verbal com protocolo por poucos dias)."
        : "Lançar o número da autorização antes de enviar.",
    );
  }
  if (faltantes.length) {
    add(
      "CAMPO_OBRIGATORIO_VAZIO",
      `Falta(m) campo(s) que ${conv.nome} exige: ${faltantes.join(", ")}.`,
      `Preencher: ${faltantes.join(", ")}.`,
    );
  }

  // --- Datas plausíveis? (não aceitar 03/03/3003 sem reclamar) ---
  const anoPlausivel = (d: Date | null) => !!d && d.getUTCFullYear() >= 2000 && d.getUTCFullYear() <= 2030;
  const dAtend = normalizarData(g.data_atendimento);
  const atendPlausivel = anoPlausivel(dAtend);
  if (g.data_atendimento.trim() && !dAtend) {
    add("DATA_INVALIDA", `A data de atendimento "${g.data_atendimento}" não é uma data válida.`, "Corrigir a data do atendimento antes de enviar.");
  } else if (dAtend && !atendPlausivel) {
    add("DATA_IMPLAUSIVEL", `A data de atendimento "${g.data_atendimento}" está fora de um período plausível (2000–2030).`, "Conferir a data do atendimento — provável erro de digitação.");
  }

  // --- 3. Autorização válida na data do atendimento ---
  const dVal = normalizarData(g.autorizacao_validade);
  if (atendPlausivel && dVal && dVal.getTime() < dAtend!.getTime()) {
    if (sig.autorizacaoPendente) {
      // nota informa autorização nova -> pendência branda, não rejeição
      if (!problemas.some((p) => p.tipo === "AUTORIZACAO_PENDENTE"))
        add(
          "AUTORIZACAO_PENDENTE",
          "Validade lançada está vencida, mas a observação informa autorização nova aguardando lançamento.",
          "Lançar a nova autorização (número e validade) antes de enviar.",
        );
    } else if (sig.remarcada) {
      add(
        "AUTORIZACAO_REMARCACAO",
        "Sessão remarcada; a autorização era da data original e pode não cobrir a nova data.",
        "Confirmar se a autorização vale para a data remarcada; renovar se preciso.",
      );
    } else {
      add(
        "AUTORIZACAO_VENCIDA",
        `Autorização venceu em ${g.autorizacao_validade}, antes do atendimento em ${g.data_atendimento}.`,
        "Renovar a autorização antes de enviar.",
      );
    }
  }

  // --- 4. Sessão dentro do limite do convênio ---
  const sessao = Number(g.sessao_numero_na_autorizacao);
  if (Number.isFinite(sessao) && sessao > conv.limite_sessoes_por_autorizacao) {
    add(
      "SESSAO_ALEM_DO_LIMITE",
      `Sessão ${sessao} passa do limite de ${conv.limite_sessoes_por_autorizacao} do ${conv.nome}.`,
      "Emitir nova autorização (o limite por autorização foi atingido).",
    );
  }
  // Limite declarado na guia diferente do limite do convênio (aviso de conferência)
  const limDecl = Number(g.autorizacao_sessoes_limite);
  if (Number.isFinite(limDecl) && limDecl !== conv.limite_sessoes_por_autorizacao) {
    add(
      "LIMITE_DIVERGENTE",
      `Limite lançado (${limDecl}) difere do limite do ${conv.nome} (${conv.limite_sessoes_por_autorizacao}).`,
      "Conferir o limite de sessões da autorização.",
      "aviso",
    );
  }

  // --- 5. Prazo de envio (conta da data do atendimento; conferência na data de lançamento) ---
  const dLanc = normalizarData(g.data_lancamento);
  if (atendPlausivel && dAtend && dLanc) {
    const dias = diasEntre(dAtend, dLanc);
    if (dias > conv.prazo_envio_dias) {
      add(
        "PRAZO_ENVIO_ESTOURADO",
        `${dias} dias entre atendimento e lançamento; o ${conv.nome} recusa após ${conv.prazo_envio_dias}.`,
        "Enviar imediatamente; risco de recusa por prazo.",
      );
    }
  }

  // --- 6. Valor de referência ---
  const valorNum = parseValor(g.valor);
  if (proc && valorNum !== null && Math.abs(valorNum - proc.valor_referencia) > 0.001) {
    add(
      "VALOR_DIVERGENTE",
      `Valor R$ ${valorNum.toFixed(2)} difere da referência de ${proc.descricao} (R$ ${proc.valor_referencia.toFixed(2)}).`,
      `Ajustar o valor para R$ ${proc.valor_referencia.toFixed(2)}.`,
      "aviso",
    );
  }

  // --- 7. Coerência do registro profissional (CREFITO para fisio, CRM para médico) ---
  const reg = (g.profissional_registro || "").toUpperCase();
  const ehFisio = g.procedimento_codigo.startsWith("5");
  const ehMedico = g.procedimento_codigo === "20103301" || g.procedimento_codigo === "40201015";
  if (reg) {
    if (ehFisio && !reg.includes("CREFITO"))
      add("REGISTRO_INCONSISTENTE", `Procedimento de fisioterapia com registro ${g.profissional_registro} (esperado CREFITO).`, "Conferir o profissional/registro lançado.");
    if (ehMedico && !reg.includes("CRM"))
      add("REGISTRO_INCONSISTENTE", `Procedimento médico com registro ${g.profissional_registro} (esperado CRM).`, "Conferir o profissional/registro lançado.");
  }

  const bloqueia = problemas.some((p) => p.severidade === "bloqueia");
  const decisao: Decisao = bloqueia ? "PENDENTE" : "OK";
  const valor_em_risco = bloqueia ? (valorNum ?? 0) : 0;
  return { id_guia: g.id_guia, convenio: g.convenio, procedimento: procNome, decisao, problemas, valor_em_risco };
}

// ----------------------------------------------------------------------------
// Relatório de terça (Dr. Renato)
// ----------------------------------------------------------------------------
export interface Relatorio {
  total: number;
  ok: number;
  pendentes: number;
  valor_em_risco_total: number;
  por_tipo: { tipo: string; quantidade: number; valor_em_risco: number }[];
  por_convenio: { convenio: string; total: number; pendentes: number; valor_em_risco: number }[];
}

export function gerarRelatorio(resultados: Resultado[]): Relatorio {
  const total = resultados.length;
  const pend = resultados.filter((r) => r.decisao === "PENDENTE");
  const porTipo = new Map<string, { quantidade: number; valor_em_risco: number }>();
  for (const r of pend) {
    const tiposBloqueio = r.problemas.filter((p) => p.severidade === "bloqueia");
    // conta a guia em cada tipo de problema que a bloqueia; valor em risco atribuído ao 1º tipo pra não duplicar
    tiposBloqueio.forEach((p, i) => {
      const cur = porTipo.get(p.tipo) || { quantidade: 0, valor_em_risco: 0 };
      cur.quantidade += 1;
      if (i === 0) cur.valor_em_risco += r.valor_em_risco;
      porTipo.set(p.tipo, cur);
    });
  }
  const porConv = new Map<string, { total: number; pendentes: number; valor_em_risco: number }>();
  for (const r of resultados) {
    const cur = porConv.get(r.convenio) || { total: 0, pendentes: 0, valor_em_risco: 0 };
    cur.total += 1;
    if (r.decisao === "PENDENTE") { cur.pendentes += 1; cur.valor_em_risco += r.valor_em_risco; }
    porConv.set(r.convenio, cur);
  }
  return {
    total,
    ok: total - pend.length,
    pendentes: pend.length,
    valor_em_risco_total: pend.reduce((s, r) => s + r.valor_em_risco, 0),
    por_tipo: [...porTipo.entries()].map(([tipo, v]) => ({ tipo, ...v })).sort((a, b) => b.quantidade - a.quantidade),
    por_convenio: [...porConv.entries()].map(([convenio, v]) => ({ convenio, ...v })).sort((a, b) => b.valor_em_risco - a.valor_em_risco),
  };
}

// ----------------------------------------------------------------------------
// Origem de cada motivo: veio da REGRA (regras_convenio.json), da OBSERVAÇÃO da
// recepção (camada de IA) ou do DICIONÁRIO de dados (coerência CREFITO/CRM).
// Deixa explícito, na tabela e na entrevista, o que é regra e o que é leitura.
// ----------------------------------------------------------------------------
export type Origem = "regra" | "observacao" | "dicionario";
export const ORIGEM_POR_TIPO: Record<string, Origem> = {
  PROCEDIMENTO_NAO_COBERTO: "regra",
  CAMPO_OBRIGATORIO_VAZIO: "regra",
  AUTORIZACAO_VENCIDA: "regra",
  SESSAO_ALEM_DO_LIMITE: "regra",
  LIMITE_DIVERGENTE: "regra",
  PRAZO_ENVIO_ESTOURADO: "regra",
  VALOR_DIVERGENTE: "regra",
  CONVENIO_DESCONHECIDO: "regra",
  PROCEDIMENTO_DESCONHECIDO: "regra",
  REGISTRO_INCONSISTENTE: "dicionario",
  RECLASSIFICAR_PARTICULAR: "observacao",
  CODIGO_ERRADO: "observacao",
  AUTORIZACAO_PENDENTE: "observacao",
  AUTORIZACAO_REMARCACAO: "observacao",
};
export const origemDe = (tipo: string): Origem => ORIGEM_POR_TIPO[tipo] ?? "regra";
