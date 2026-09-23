# Verificador de guias de convênio — Clínica Vitalis

Confere cada guia de convênio **antes** de ela ser enviada, apontando se está
OK ou pendente, o motivo e o que corrigir — e gera o relatório de terça com
quanto está em risco.

> Feito para a etapa técnica da Expert Integrado. Dados fictícios.

## Como rodar
```bash
npm install
npm run rodar        # roda o verificador contra as 80 guias de agosto
```

## Estrutura
- `src/nucleo.ts` — motor de verificação (regra) + leitura da observação (IA).
- `src/rodar.ts` — carrega os dados e imprime as decisões + o relatório.
- `data/` — guias.csv e regras_convenio.json.

---

## Como fiz  _(preencher ao final)_
- Ferramentas e por quê:
- O que a IA gerou e o que eu mudei na mão (3+ decisões minhas):
- O que ficou de fora e por quê:
- Como testei:
- Tempo aproximado:
