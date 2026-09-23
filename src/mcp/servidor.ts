// servidor.ts — servidor MCP da Clínica Vitalis.
// Expõe DUAS ferramentas exigidas pela prova. Ele é uma casca fina: toda a
// lógica vem de ferramentas.ts, que por sua vez chama o mesmo motor do lote.
// Fonte única de decisão — nada de regra duplicada aqui.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { consultarRegra, verificarGuiaTool } from "./ferramentas.js";

const server = new McpServer({ name: "vitalis-guias", version: "0.1.0" });

const json = (obj: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(obj, null, 2) }] });

// ---- Ferramenta 1 ----
server.registerTool(
  "consultar_regra",
  {
    title: "Consultar regra do convênio",
    description:
      "Devolve, para um convênio e um procedimento, se é coberto, o valor de referência, " +
      "os campos obrigatórios, o limite de sessões e o prazo de envio. Fonte: regras_convenio.json.",
    inputSchema: {
      convenio: z.string().describe("Nome do convênio: Vitalcard, Saúde Interior ou Plano Bem."),
      procedimento_codigo: z.string().describe("Código do procedimento, ex.: 50000470."),
    },
  },
  async ({ convenio, procedimento_codigo }) => json(consultarRegra(convenio, procedimento_codigo)),
);

// ---- Ferramenta 2 ----
server.registerTool(
  "verificar_guia",
  {
    title: "Verificar guia",
    description:
      "Confere uma guia e devolve OK ou PENDENTE, com os motivos, a correção e o valor em risco. " +
      "Pode receber o id_guia (busca no lote de agosto) OU os campos da guia (ex.: vindos da Skill). " +
      "A decisão é 100% determinística, baseada nas regras do convênio.",
    inputSchema: {
      id_guia: z.string().optional().describe("Id de uma guia do lote de agosto, ex.: G-2608-0069."),
      convenio: z.string().optional(),
      data_atendimento: z.string().optional(),
      carteirinha: z.string().optional(),
      cid: z.string().optional(),
      procedimento_codigo: z.string().optional(),
      numero_autorizacao: z.string().optional(),
      autorizacao_validade: z.string().optional(),
      autorizacao_sessoes_limite: z.string().optional(),
      sessao_numero_na_autorizacao: z.string().optional(),
      profissional_registro: z.string().optional(),
      valor: z.string().optional(),
      observacao_recepcao: z.string().optional(),
      data_lancamento: z.string().optional(),
    },
  },
  async (args) => json(verificarGuiaTool(args)),
);

// Transporte stdio: o MCP conversa por entrada/saída padrão, que é como o
// Claude Desktop e o MCP Inspector se conectam a ele.
const transport = new StdioServerTransport();
await server.connect(transport);
console.error("MCP vitalis-guias no ar (stdio).");
