// browser.ts — ponto de entrada para o navegador.
// Expõe o MESMO motor que roda no lote e no MCP. A página não decide nada:
// chama window.VITALIS.verificarGuia, igual ao MCP e ao relatório.
import { verificarGuia, gerarRelatorio, origemDe, normalizarData } from "../nucleo.js";
import regras from "../../data/regras_convenio.json";

(window as any).VITALIS = { verificarGuia, gerarRelatorio, origemDe, normalizarData, regras };
