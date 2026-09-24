# Verificador de guias de convênio — Clínica Vitalis

Confere cada guia de convênio **antes** de ela ser enviada, dizendo se está **OK** ou **PENDENTE**, o motivo e o que corrigir — e gera o relatório de terça do Dr. Renato com quanto está em risco.

> Etapa técnica da Expert Integrado (Consultor de Negócios com IA). Dados fictícios.

- **Solução no ar:** https://lilimatsuzawa.github.io/verificador-guias-vitalis/
- **Repositório:** https://github.com/lilimatsuzawa/verificador-guias-vitalis

## O problema

Hoje a conferência das guias acontece tarde: a recepção lança, o financeiro confere no fim do mês, e o erro só aparece quando o convênio glosa (~60 dias depois). São ~900 guias/mês e ninguém consegue conferir uma a uma. Esta solução move a conferência para **antes do envio**, automática e explicável, e mostra ao Dr. Renato, toda terça, quantas guias foram verificadas, quantas têm problema, de que tipo e quanto está em risco.

## Como rodar

```bash
npm install
npm run rodar     # confere as 80 guias no terminal + imprime o relatório
npm run tabela    # gera a tabela das 80 (markdown + csv)
npm run site      # gera a página web em docs/index.html
npm run mcp:teste # sobe o MCP e chama as duas ferramentas
npm test          # 21 testes automatizados
```

## Arquitetura — uma única fonte de decisão

```
regras_convenio.json
        |
   MOTOR (regra deterministica)  <- src/nucleo.ts
        |
   +----+---------------+---------------+------------+
  MCP (2 tools)     Pagina web     Lote/relatorio   Testes
        |
     Skill (IA le o texto da recepcao e chama o MCP)
```

O motor e o unico lugar que decide. O MCP, a pagina, o relatorio e os testes **passam todos por ele** — regra nao esta duplicada em lugar nenhum. A IA entra so na borda (a Skill), transformando o texto informal da recepcao em dados estruturados.

## Como fiz

### Ferramentas e por que
- **TypeScript + Node** — o SDK oficial de MCP e first-class em TS, e e o meu terreno; o criterio e saber explicar cada parte, entao usei o que domino.
- **SDK oficial do MCP** (`@modelcontextprotocol/sdk`) para as duas ferramentas; **zod** para validar a entrada.
- **esbuild** para levar o mesmo motor ao navegador (a pagina usa a mesma `verificarGuia` do lote e do MCP).
- **Runner de testes nativo do Node** (`node:test`) — zero dependencia.
- **Dados em memoria** (80 guias) — nao usei banco: seria peso sem ganho para este volume.
- **GitHub Pages** para o deploy (estatico, custo zero, na minha propria infra).

### O que a IA gerou e o que eu decidi (usei IA como par, como a prova permite; as decisoes foram minhas)
1. **Motor deterministico, IA na borda.** As regras dos convenios sao estruturadas e explicitas, entao a decisao e 100% codigo auditavel. A IA so interpreta o texto da recepcao; nunca decide. Isso me da previsibilidade e testabilidade. Na pagina, essa leitura por IA e **opcional** e usa o **Haiku** (modelo mais barato) com a chave do proprio usuario, guardada so no navegador (modo de teste, "bring your own key"); em producao a chamada iria por um backend com a chave protegida. Sem chave, a leitura cai no modo deterministico. **Nao ha segredo no repositorio** — nenhuma chave e commitada.
2. **Nao verifico a "idade da autorizacao".** A prova esclareceu que nao existe data de concessao nos dados — so a validade. Checar a idade seria inventar um erro que nao da para comprovar, entao explicitamente pulei.
3. **Valor em risco = valor da guia**, nao valor x probabilidade de glosa. A prova nao fornece probabilidade individual; "em risco" e a producao bloqueada por uma pendencia. E mais honesto e defensavel.
4. **Normalizacao antes de comparar + coerencia CREFITO/CRM.** Duas datas vem em `dd/mm/aaaa` e um valor vem `"62,00"`; sem normalizar, aparece prazo fantasma. E adicionei um check tirado do dicionario (fisioterapia exige CREFITO, procedimento medico exige CRM), que pega inconsistencias sem depender das regras.

### O que ficou de fora e por que
- **Idade da autorizacao** — sem data de concessao, nao e verificavel.
- **Banco de dados, autenticacao e UI sofisticada** — desnecessarios para o escopo; a prova pede que funcione e seja explicavel, nao bonito.
- **Um agente que decide via LLM** — de proposito. Deixar o modelo decidir a regra seria menos previsivel e menos testavel.

### Como testei
- **21 testes automatizados** (`npm test`): um por classe de erro contra uma guia real do lote, os casos que a observacao recategoriza, as regras dinamicas por convenio, a normalizacao, e um teste-**golden** que trava o relatorio inteiro das 80.
- Conferencia manual da **tabela das 80** (decisao + motivo + origem: regra / observacao / dicionario).
- **Teste-cliente do MCP** que sobe o servidor e chama as duas ferramentas.

### Tempo aproximado
Cerca de **5-6 horas**.

## Estrutura

```
src/nucleo.ts          motor de regras + leitura da observacao
src/dados.ts           carregador de guias.csv e regras
src/rodar.ts           relatorio no terminal
src/tabela.ts          tabela das 80 (md + csv)
src/nucleo.test.ts     21 testes
src/mcp/               servidor MCP + ferramentas
src/web/ + scripts/    pagina web (gera docs/index.html)
.claude/skills/        a Skill do operador
data/                  guias.csv, regras_convenio.json
docs/index.html        pagina publicada (GitHub Pages)
```
