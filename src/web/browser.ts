// browser.ts — ponto de entrada para o navegador.
// Expõe o MESMO motor que roda no lote e no MCP. A página web não tem lógica
// de decisão própria: ela chama window.VITALIS.verificarGuia, exatamente como
// o MCP e o relatório do terminal. Fonte única de decisão.
import { verificarGuia, gerarRelatorio, origemDe } from "../nucleo.js";
import regras from "../../data/regras_convenio.json";

(window as any).VITALIS = { verificarGuia, gerarRelatorio, origemDe, regras };
