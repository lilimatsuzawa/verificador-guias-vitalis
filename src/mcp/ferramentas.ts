// ferramentas.ts — a lógica das duas ferramentas do MCP, como funções puras.
// Ficam separadas do servidor pra serem testáveis sem subir o MCP. Nenhuma
// delas tem regra de negócio própria: consultam o JSON ou chamam o motor.
import { GuiaCrua, verificarGuia } from "../nucleo.js";
import { carregarRegras, carregarGuias } from "../dados.js";

const regras = carregarRegras();
const guias = carregarGuias();

// ---- Ferramenta 1: consultar a regra de um convênio para um procedimento ----
export function consultarRegra(convenio: string, procedimento_codigo: string) {
  const conv = regras.convenios.find((c) => c.nome.toLowerCase() === convenio.toLowerCase());
  if (!conv) {
    return { erro: `Convênio "${convenio}" não encontrado.`, convenios_validos: regras.convenios.map((c) => c.nome) };
  }
  const proc = regras.procedimentos.find((p) => p.codigo === procedimento_codigo);
  if (!proc) {
    return { erro: `Procedimento "${procedimento_codigo}" não encontrado.`, procedimentos_validos: regras.procedimentos.map((p) => ({ codigo: p.codigo, descricao: p.descricao })) };
  }
  return {
    convenio: conv.nome,
    procedimento: {
      codigo: proc.codigo,
      descricao: proc.descricao,
      coberto: conv.procedimentos_cobertos.includes(proc.codigo),
      valor_referencia: proc.valor_referencia,
    },
    campos_obrigatorios: conv.campos_obrigatorios,
    limite_sessoes_por_autorizacao: conv.limite_sessoes_por_autorizacao,
    prazo_envio_dias: conv.prazo_envio_dias,
    observacao_convenio: conv.observacao,
  };
}

// ---- Ferramenta 2: verificar uma guia (por id do lote OU por dados colados) ----
export function verificarGuiaTool(input: { id_guia?: string } & Partial<GuiaCrua>) {
  let guia: GuiaCrua;
  if (input.id_guia && !input.convenio) {
    // busca a guia no lote de agosto pelo id
    const achada = guias.find((g) => g.id_guia === input.id_guia);
    if (!achada) return { erro: `Guia "${input.id_guia}" não encontrada no lote de agosto.` };
    guia = achada;
  } else {
    // guia montada a partir dos campos recebidos (ex.: vinda da Skill)
    const vazio: GuiaCrua = {
      id_guia: "", unidade: "", data_atendimento: "", paciente: "", convenio: "",
      carteirinha: "", cid: "", procedimento_codigo: "", procedimento_descricao: "",
      numero_autorizacao: "", autorizacao_validade: "", autorizacao_sessoes_limite: "",
      sessao_numero_na_autorizacao: "", profissional: "", profissional_registro: "",
      valor: "", observacao_recepcao: "", data_lancamento: "",
    };
    guia = { ...vazio, ...input };
  }
  return verificarGuia(guia, regras);
}
