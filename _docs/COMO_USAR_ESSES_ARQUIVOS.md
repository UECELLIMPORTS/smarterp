# Como usar os arquivos de documentação

> Este guia é para você — o dono do projeto — entender o que cada arquivo faz e como pedir para o Claude Code atualizá-los.

---

## O que é essa pasta `_docs/`?

É a memória do projeto. Toda vez que a sessão com o Claude termina, o contexto se perde. Esses arquivos guardam o histórico para que na próxima sessão você possa retomar de onde parou, sem precisar explicar tudo de novo.

**Regra simples:** ao começar uma nova sessão, cole o prompt que está em `SESSAO_CONTEXTO.md`. Ao terminar, peça ao Claude para atualizar os arquivos.

---

## Os 7 arquivos e quando usar cada um

---

### 1. `SESSAO_CONTEXTO.md` — O mais importante
**O que é:** Handoff entre sessões. Tem um prompt pronto para você copiar e colar no início de cada conversa nova com o Claude.

**Quando usar:**
- ✅ Copie o prompt da seção "Prompt pronto para retomar amanhã" no início de cada sessão nova
- ✅ Peça ao Claude para atualizar no final de cada sessão

**Frases para dizer ao Claude:**
> "Atualize o `_docs/SESSAO_CONTEXTO.md` com o que fizemos hoje."
> "Gere um novo prompt de retomada no `SESSAO_CONTEXTO.md` para a próxima sessão."

---

### 2. `status-desenvolvimento.md` — O painel de controle
**O que é:** Uma tabela mostrando o status de cada módulo dos dois projetos (SmartERP e CheckSmart). Use para saber rapidamente o que está pronto, em andamento ou não iniciado.

**Quando usar:**
- ✅ Quando quiser uma visão geral do que está feito e o que falta
- ✅ Quando terminar um módulo novo

**Frases para dizer ao Claude:**
> "Marque o módulo CRM como concluído no `status-desenvolvimento.md`."
> "Atualize o status do módulo Relatórios para 'Em andamento'."
> "Quais módulos ainda não foram iniciados?"

---

### 3. `bugs.md` — O registro de problemas
**O que é:** Lista de todos os bugs encontrados, com a causa e o que foi feito para resolver. Evita que o mesmo erro seja investigado duas vezes.

**Quando usar:**
- ✅ Quando alguma coisa parar de funcionar
- ✅ Quando o Claude encontrar um erro durante o desenvolvimento
- ✅ Para verificar se um problema que apareceu hoje já foi visto antes

**Frases para dizer ao Claude:**
> "Registre esse erro no `bugs.md` como BUG-008."
> "O módulo financeiro está dando erro ao salvar — adicione no `bugs.md`."
> "Marque o BUG-003 como resolvido no `bugs.md`."
> "Já tivemos esse problema de CPF duplicado antes? Veja no `bugs.md`."

---

### 4. `decisoes-tecnicas.md` — O diário de escolhas
**O que é:** Registro de decisões importantes: por que usamos tecnologia X e não Y, por que a importação funciona de um jeito e não de outro. Evita rever decisões que já foram tomadas com bom motivo.

**Quando usar:**
- ✅ Antes de mudar algo importante (verifique se já foi decidido antes)
- ✅ Quando o Claude escolher uma abordagem e você quiser registrar o motivo
- ✅ Se alguém perguntar "por que funciona assim?"

**Frases para dizer ao Claude:**
> "Registre no `decisoes-tecnicas.md` por que escolhemos usar Route Handler em vez de Server Action para o autocomplete."
> "Por que a busca de clientes funciona com GET e não POST? Veja nas decisões técnicas."
> "Adicione como DECISÃO-010 a escolha de não usar cache no módulo financeiro."

---

### 5. `pendencias.md` — A lista de tarefas
**O que é:** Tudo que precisa ser feito, dividido por prioridade (urgente, importante, quando der). É a sua lista de backlog.

**Quando usar:**
- ✅ No início de cada sessão para escolher o que fazer
- ✅ Quando surgir uma ideia nova que não dá para fazer agora
- ✅ Quando terminar uma tarefa

**Frases para dizer ao Claude:**
> "Marque como concluída a tarefa de autocomplete no `pendencias.md`."
> "Adicione como urgente no `pendencias.md`: o módulo financeiro não está calculando os descontos."
> "Adicione como 'quando der': criar página de aniversariantes do mês."
> "Quais são as tarefas urgentes pendentes?"
> "O que temos na fila para o próximo sprint?"

---

### 6. `mapa-arquivos.md` — O mapa do projeto
**O que é:** Uma referência de onde fica cada arquivo e o que ele faz. Útil quando você não lembra onde está determinada funcionalidade.

**Quando usar:**
- ✅ Quando quiser saber em qual arquivo está uma função específica
- ✅ Quando um arquivo novo for criado

**Frases para dizer ao Claude:**
> "Onde fica o código do botão de exportar CSV?"
> "Adicione o novo arquivo `actions/relatorios.ts` no `mapa-arquivos.md`."
> "Em qual arquivo está a lógica de importação do Bling?"

---

### 7. `COMO_USAR_ESSES_ARQUIVOS.md` — Este arquivo
**O que é:** O guia que você está lendo agora. Não precisa atualizar com frequência — só se o processo mudar.

**Quando usar:**
- ✅ Quando esquecer como funciona o processo
- ✅ Para mostrar para alguém novo que entrar no projeto

---

## Como funciona o processo no dia a dia

```
INÍCIO DA SESSÃO
      │
      ▼
  Copie o prompt de
  SESSAO_CONTEXTO.md
  e cole no chat
      │
      ▼
  Trabalhe normalmente
  com o Claude
      │
      ▼
  Ao terminar, diga:
  "Atualize os docs
  com o que fizemos"
      │
      ▼
FIM DA SESSÃO
```

---

## Frase mágica para encerrar qualquer sessão

Diga isso ao Claude no final de cada dia de trabalho:

> "Vamos encerrar a sessão. Atualize os seguintes arquivos em `_docs/` com o que fizemos hoje: `SESSAO_CONTEXTO.md`, `pendencias.md`, `status-desenvolvimento.md`. Se tiver novos bugs, adicione em `bugs.md`. Se tiver novas decisões técnicas, adicione em `decisoes-tecnicas.md`."

---

## Dica importante

Esses arquivos só são úteis se forem atualizados. O Claude não atualiza automaticamente — você precisa pedir. Uma boa prática é reservar os **últimos 5 minutos de cada sessão** para pedir a atualização.
