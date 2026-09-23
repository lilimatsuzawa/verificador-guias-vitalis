// teste-cliente.ts — sobe o servidor MCP e chama as duas ferramentas, pra
// provar que ele funciona ponta a ponta pelo stdio (sem precisar do Inspector).
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const AQUI = dirname(fileURLToPath(import.meta.url));

const transport = new StdioClientTransport({
  command: "npx",
  args: ["tsx", join(AQUI, "servidor.ts")],
});
const client = new Client({ name: "teste", version: "1.0.0" });
await client.connect(transport);

const { tools } = await client.listTools();
console.log("Ferramentas expostas:", tools.map((t) => t.name).join(", "));

console.log("\n-- consultar_regra(Vitalcard, 40201015 infiltração) --");
const r1 = await client.callTool({ name: "consultar_regra", arguments: { convenio: "Vitalcard", procedimento_codigo: "40201015" } });
console.log((r1.content as any)[0].text);

console.log("\n-- verificar_guia(id G-2608-0041, autorização verbal) --");
const r2 = await client.callTool({ name: "verificar_guia", arguments: { id_guia: "G-2608-0041" } });
console.log((r2.content as any)[0].text);

await client.close();
