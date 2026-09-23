// nucleo.test.ts — testes automatizados (runner nativo do Node, sem dependência).
// Rode com: npm test
// Cada teste pega uma guia REAL do lote pelo id e confere a decisão/motivo,
// mais o relatório inteiro travado (golden) e as ferramentas do MCP.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { verificarGuia, gerarRelatorio, normalizarData, parseValor, Resultado } from "./nucleo.js";
import { carregarGuias, carregarRegras } from "./dados.js";
import { consultarRegra, verificarGuiaTool } from "./mcp/ferramentas.js";

const regras = carregarRegras();
const guias = carregarGuias();
const guia = (id: string) => {
  const g = guias.find((x) => x.id_guia === id);
  if (!g) throw new Error(`guia ${id} não existe no lote`);
  return g;
};
const conferir = (id: string): Resultado => verificarGuia(guia(id), regras);
const temTipo = (r: Resultado, tipo: string) => r.problemas.some((p) => p.tipo === tipo);

describe("Classes de erro — cada tipo travando uma guia real do lote", () => {
  const casos: [string, string, string][] = [
    ["G-2608-0004", "AUTORIZACAO_VENCIDA", "autorização vencida na data do atendimento"],
    ["G-2608-0008", "SESSAO_ALEM_DO_LIMITE", "sessão além do limite do convênio"],
    ["G-2608-0002", "PROCEDIMENTO_NAO_COBERTO", "procedimento não coberto (consulta no Plano Bem)"],
    ["G-2608-0013", "CAMPO_OBRIGATORIO_VAZIO", "campo obrigatório vazio"],
    ["G-2608-0041", "AUTORIZACAO_PENDENTE", "autorização verbal pendente de número"],
    ["G-2608-0069", "CODIGO_ERRADO", "código errado revelado pela observação"],
    ["G-2608-0039", "RECLASSIFICAR_PARTICULAR", "recepção pediu faturar particular"],
    ["G-2608-0045", "REGISTRO_INCONSISTENTE", "fisioterapia com registro médico (CRM)"],
  ];
  for (const [id, tipo, desc] of casos) {
    test(`${id}: PENDENTE por ${tipo} (${desc})`, () => {
      const r = conferir(id);
      assert.equal(r.decisao, "PENDENTE");
      assert.ok(temTipo(r, tipo), `esperava o motivo ${tipo}`);
    });
  }
});

describe("Guias OK", () => {
  test("G-2608-0001: guia correta passa como OK", () => {
    assert.equal(conferir("G-2608-0001").decisao, "OK");
  });
  test("G-2608-0016: data em dd/mm/aaaa é normalizada e não vira prazo fantasma", () => {
    assert.equal(guia("G-2608-0016").data_atendimento.includes("/"), true); // confirma o formato brasileiro
    assert.equal(conferir("G-2608-0016").decisao, "OK");
  });
});

describe("A leitura da observação recategoriza a decisão", () => {
  test("G-2608-0030: vira PENDENTE por autorização nova, NÃO por vencida", () => {
    const r = conferir("G-2608-0030");
    assert.ok(temTipo(r, "AUTORIZACAO_PENDENTE"));
    assert.ok(!temTipo(r, "AUTORIZACAO_VENCIDA"), "não deveria acusar vencida — a nota informa autorização nova");
  });
  test("G-2608-0041: vira PENDENTE por verbal, NÃO por número ausente", () => {
    const r = conferir("G-2608-0041");
    assert.ok(temTipo(r, "AUTORIZACAO_PENDENTE"));
    assert.ok(!temTipo(r, "CAMPO_OBRIGATORIO_VAZIO"), "não deveria acusar campo vazio — a nota explica o protocolo");
  });
});

describe("Campos obrigatórios são dinâmicos por convênio (vêm do JSON)", () => {
  test("Vitalcard EXIGE CID: guia sem CID fica pendente", () => {
    const r = conferir("G-2608-0021"); // Vitalcard, cid vazio
    assert.equal(r.decisao, "PENDENTE");
    assert.ok(temTipo(r, "CAMPO_OBRIGATORIO_VAZIO"));
  });
  test("Saúde Interior NÃO exige CID: guia sem CID fica OK", () => {
    const g = guia("G-2608-0009"); // Saúde Interior, cid vazio
    assert.equal(g.cid.trim(), "");
    assert.equal(conferir("G-2608-0009").decisao, "OK");
  });
});

describe("Normalização de dados (a armadilha de qualidade)", () => {
  test("data dd/mm/aaaa equivale à ISO", () => {
    assert.equal(normalizarData("03/08/2026")!.getTime(), normalizarData("2026-08-03")!.getTime());
  });
  test("valor com vírgula decimal é lido certo", () => {
    assert.equal(parseValor("62,00"), 62);
    assert.equal(parseValor("62.00"), 62);
  });
});

describe("Validação de datas implausíveis (guia digitada errado)", () => {
  const base = {
    convenio: "Vitalcard", procedimento_codigo: "50000470", carteirinha: "1", cid: "M79.7",
    numero_autorizacao: "AUT1", autorizacao_validade: "2026-09-10", autorizacao_sessoes_limite: "10",
    sessao_numero_na_autorizacao: "3", profissional_registro: "CREFITO-3 1-F", valor: "62.00",
    data_lancamento: "2026-08-22", observacao_recepcao: "",
  };
  test("ano absurdo (3003) vira PENDENTE por DATA_IMPLAUSIVEL, não por vencida", () => {
    const r = verificarGuia({ ...base, data_atendimento: "3003-08-20" } as any, regras);
    assert.equal(r.decisao, "PENDENTE");
    assert.ok(r.problemas.some((p) => p.tipo === "DATA_IMPLAUSIVEL"));
    assert.ok(!r.problemas.some((p) => p.tipo === "AUTORIZACAO_VENCIDA"));
  });
  test("data que não parseia vira DATA_INVALIDA", () => {
    const r = verificarGuia({ ...base, data_atendimento: "32/13/2026" } as any, regras);
    assert.ok(r.problemas.some((p) => p.tipo === "DATA_INVALIDA"));
  });
});

describe("Relatório do lote (golden — trava as 80 de uma vez)", () => {
  test("80 guias · 46 OK · 34 pendentes · R$ 2.482 em risco", () => {
    const rel = gerarRelatorio(guias.map((g) => verificarGuia(g, regras)));
    assert.equal(rel.total, 80);
    assert.equal(rel.ok, 46);
    assert.equal(rel.pendentes, 34);
    assert.equal(rel.valor_em_risco_total, 2482);
  });
});

describe("Ferramentas do MCP (passam pelo mesmo motor)", () => {
  test("consultar_regra: Plano Bem NÃO cobre consulta ortopédica", () => {
    const r: any = consultarRegra("Plano Bem", "20103301");
    assert.equal(r.procedimento.coberto, false);
  });
  test("consultar_regra: Vitalcard cobre fisioterapia musculoesquelética", () => {
    const r: any = consultarRegra("Vitalcard", "50000470");
    assert.equal(r.procedimento.coberto, true);
  });
  test("verificar_guia por id: G-2608-0069 é PENDENTE", () => {
    const r: any = verificarGuiaTool({ id_guia: "G-2608-0069" });
    assert.equal(r.decisao, "PENDENTE");
  });
  test("verificar_guia: id inexistente devolve erro tratado", () => {
    const r: any = verificarGuiaTool({ id_guia: "G-0000-XXXX" });
    assert.ok(r.erro);
  });
});
