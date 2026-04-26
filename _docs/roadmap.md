# Roadmap — Gestão Inteligente

> **Última atualização:** 26/04/2026
> **Status do produto:** ~70% pronto. Falta principalmente a camada de
> "transformar usuário em cliente pagante" (signup + pagamento + gates).
>
> **Próximo bloco prioritário:** Nível 1 (vender de verdade)

---

## ✅ O que já está pronto

### Sistema Gestão Smart (antes "SmartERP")
- Frente de Caixa (POS) com busca, carrinho, finalização, modal de cliente novo
- Estoque com snapshot de custo (`sale_items.cost_snapshot_cents`)
- Financeiro consolidado (sales ERP + service_orders CheckSmart)
  - Cancelar / Reativar / Editar venda / Reclassificar canal
  - Editar OS do CheckSmart (Opção B — sem mexer em peças)
- Clientes (cadastro + busca + histórico)
- Analytics ERP Clientes (comparativo SmartERP vs CheckSmart, Origem dos Clientes,
  Heatmap por dia da semana, Clientes em risco)
- **Analytics Canais** (`/analytics/canais`)
  - Online vs Física
  - Performance por canal (com Lucro e Margem %)
  - Origem dos clientes (real)
  - Origem inferida (vendas sem cadastro)
  - Origem × Canal (heatmap)
  - **Break-even** da loja física
  - Modalidade de Entrega
  - Evolução diária com toggle Faturamento↔Lucro
  - **CAC e ROAS por canal** via Meta Ads
- Diagnóstico de Lucro (`/erp-clientes/diagnostico-lucro`)
  - Itens órfãos sem product_id (com auto-vinculação por nome)
  - Vendas com prejuízo (custo > receita)
  - OSs com peças sem custo
  - Produtos sem cost_cents cadastrado
- Relatórios (com filtros de origem + canal)
- Meta Ads (multi-conta, alertas, relatórios, atribuição via campaign_code)
- Dashboard principal (com filtro Status OS, donut Faturamento por Canal,
  Origem dos Clientes)
- **Mobile responsivo:** sidebar drawer com hamburger, tabelas com card view,
  POS sticky bar de finalizar, modais com grid responsivo
- Auth via Supabase + multi-tenant (tenant_id em todas tabelas)

### CheckSmart (sistema separado pra assistência técnica)
- OS multi-aparelho com checklist
- Escudo jurídico (aparelho apagado bloqueia checklist)
- PDF assinado
- Canal de venda + Modalidade de entrega (sincronizado com SmartERP)
- Edição completa da OS

### Site comercial (`smartgestao-site`)
- Landing (Hero, Sistemas, Diferenciais, Prova Social, Pricing,
  FAQ, CTA final)
- Página `/checksmart` dedicada
- Página `/demo` com formulário que abre WhatsApp
- **Apresentação** `/apresentacao` com 13 slides navegáveis (← → setas, F
  fullscreen, QR codes via api.qrserver.com)
- Header sticky responsivo + WhatsApp FAB

---

## 🎯 NÍVEL 1 — Pra começar a vender de verdade (~3-4 semanas) 🔥 PRÓXIMO

> Sem isso o produto não vira SaaS — fica como demo gratuita.

### 1.1. Cadastro público + setup wizard (3-4 dias)
- Página `/signup` no smarterp com formulário (nome, email, senha, nome da loja)
- Cria tenant automaticamente (RPC no Supabase)
- Wizard pós-signup: primeiro produto, primeiro cliente, configurar canal
- Email de boas-vindas (depende de 2.1)

### 1.2. Pagamento recorrente — Asaas (3-5 dias)
- Integração com Asaas API (gateway brasileiro, mais simples que Stripe)
- Cobrança recorrente: cartão de crédito + PIX recorrente
- Webhook de pagamento confirmado / falha → atualiza `subscriptions.status`
- Tabela `subscriptions` (tenant_id, plan, status, valid_until, asaas_subscription_id)
- Página `/configuracoes/assinatura`: ver fatura atual, próxima cobrança, mudar
  cartão, cancelar

### 1.3. Trial de 7 dias automático (1 dia)
- Toda nova conta entra com `trial_ends_at = now() + 7 days`
- Banner global "Trial expira em X dias · Assinar agora"
- Quando expira: bloqueia tudo exceto `/configuracoes/assinatura`

### 1.4. Gates de feature por plano (2-3 dias)
- Middleware/HOC que verifica plano antes de renderizar página
- **Básico**: bloqueia `/erp-clientes`, `/analytics/canais`,
  `/relatorios`, `/meta-ads`, `/crm`
- **Pro**: bloqueia `/meta-ads` e `/crm`
- **Premium**: tudo liberado
- Página de "upgrade" quando bate em feature paga (mostra benefício + CTA)

### 1.5. Página "Minha Assinatura" + cancelamento self-service (2 dias)
- Ver plano atual, valor, próxima cobrança
- Mudar plano (upgrade imediato com pro-rata, downgrade no fim do ciclo)
- Cancelar (com confirmação dupla + tela de "winback" oferecendo desconto)
- Histórico de faturas baixáveis

**Resultado do Nível 1:** cliente entra na landing → assina sozinho → começa
a usar → você só recebe o dinheiro automaticamente.

---

## 🚀 NÍVEL 2 — Pra escalar com tranquilidade (~3 semanas)

> Depois dos primeiros 5-10 clientes pagantes do Nível 1.

### 2.1. Email transacional (1-2 dias)
- Provider: **Resend** (mais simples) ou SendGrid
- Templates: boas-vindas, recuperar senha, cobrança falha, renovação,
  cancelamento confirmado, fim de trial em 1 dia

### 2.2. Multi-usuário no tenant (3-4 dias)
- Tabela `tenant_members` (user_id, tenant_id, role: owner/manager/seller)
- Owner convida membros por email
- Permissões por role:
  - owner: tudo + assinatura
  - manager: tudo exceto assinatura
  - seller: só POS + clientes (sem financeiro/relatórios)
- Página `/configuracoes/equipe`

### 2.3. Notificações in-app (2-3 dias)
- O sininho do header não funciona ainda — implementar
- Tabela `notifications` (user_id, type, payload, read_at)
- Eventos que geram notificação: alerta Meta Ads (já existe backend),
  OS finalizada, cliente em risco detectado, pagamento falhou
- Realtime via Supabase Realtime

### 2.4. LGPD + Termos + cookies banner (1 dia)
- Páginas `/privacidade` e `/termos` no smartgestao-site
- Banner de cookies (LGPD compliance)
- Checkbox no signup: "concordo com termos e privacidade"

### 2.5. Recuperação de senha (1 dia)
- Página `/forgot-password`
- Link via Supabase Auth (já tem nativo, só configurar template)

---

## 🔥 NÍVEL 3 — CRM Inbox WhatsApp + Instagram (~3-5 semanas) **diferencial Premium**

> Bandeira de venda do plano Premium. Vide
> `~/.claude/projects/-Users-uedson/memory/project_smartgestao_crm_inbox.md`

### 3.1. Setup Meta API (1 semana)
- Criar Meta Business + verificar
- Provisionar número WhatsApp dedicado pelo Cloud API
  - Ou alternativa MVP: **Evolution API self-hosted** (grátis, comunidade BR)
- Vincular Instagram Business à Facebook Page
- Configurar webhooks → backend smarterp

### 3.2. Inbox unificado (2 semanas)
- Tabelas:
  - `inbox_conversations` (tenant_id, customer_id, channel, last_msg_at, unread_count)
  - `inbox_messages` (conversation_id, direction, body, attachments, sent_at)
- Webhook recebe msg do WhatsApp/Instagram → identifica/cria customer → salva mensagem
- UI estilo "WhatsApp Web" dentro do sistema:
  - Lista de conversas à esquerda (com unread badge)
  - Janela de chat à direita
  - Composer com upload de arquivo
- Realtime via Supabase Realtime (msg chega na hora pra outro user logado)

### 3.3. Integração com CRM (1 semana)
- Toda conversa amarra no `customers.id`
- Histórico do cliente unifica: mensagens + vendas + OSs em ordem cronológica
- Tag/notas internas na conversa (não vão pro cliente)
- Atribuir conversa pra vendedor específico (depende de 2.2 multi-user)

### 3.4. Automação (1 semana, opcional)
- Mensagens automáticas: boas-vindas a cliente novo, lembrete de OS pronta,
  aniversário, follow-up de carrinho abandonado
- Templates pré-aprovados pela Meta
- Regras de roteamento (palavra X → vendedor Y)

**Custos do WhatsApp Cloud API**: 1.000 conversas/mês grátis por categoria
(Marketing/Utility/Auth/Service); depois cobrado por conversa de 24h.
Pra MVP, Evolution API self-hosted é grátis.

---

## 🎁 NÍVEL 4 — Diferenciais avançados (médio prazo, conforme demanda)

| # | O que | Quando atacar |
|---|-------|---------------|
| 4.1 | **NF-e / NFC-e** (cupom fiscal) | Quando cliente pedir. Parceria com Tecnospeed/Focus NFe. |
| 4.2 | **Programa de indicação** (cliente A indica B → 1 mês grátis) | Crescimento orgânico após 50+ clientes. |
| 4.3 | **Integrações bancárias** (extrato Itaú/Bradesco/Inter) | Cliente avançado pede. |
| 4.4 | **Status page + SLA documentado** (status.gestaointeligente.com.br) | Confiança institucional. |
| 4.5 | **App mobile nativo** (React Native ou wrapper) | Quando 50%+ dos acessos forem mobile. |
| 4.6 | **API pública + integrações** (Zapier, Make, n8n) | Quando cliente enterprise pedir. |
| 4.7 | **Fluxo de caixa projetado** (entradas/saídas futuras) | Diferencial pra plano Premium+. |
| 4.8 | **Conciliação bancária automática** | Junto com 4.3. |

---

## 📋 Decisões técnicas registradas

| Decisão | Por quê | Data |
|---------|---------|------|
| **Billing modular: 4 produtos independentes** (`gestao_smart`, `checksmart`, `crm`, `meta_ads`) — `subscriptions` ganha coluna `product` + UNIQUE `(tenant_id, product)` | Cliente pode contratar 1, alguns ou todos os sistemas separados ou em pacote | 26/04/2026 |
| Pagamento via **Asaas** (não Stripe) | Gateway nacional, suporta PIX recorrente, fácil pra brasileiro entender fatura | 26/04/2026 |
| Email via **Resend** (não SendGrid) | API mais simples, plano gratuito 100/dia, templates React | 26/04/2026 |
| WhatsApp via **Evolution API** no MVP, **Meta Cloud API** em produção | Evolution = grátis, Cloud API = oficial e estável | 26/04/2026 |
| CRM Inbox é **módulo do Premium**, não vendido à parte | Bandeira de upsell pro Premium | 26/04/2026 |
| Trial **7 dias** (não 14 ou 30) | Já é a promessa da landing | 26/04/2026 |
| Tabela `subscriptions` com `valid_until` | Suporta trial + assinatura ativa + grace period com mesma estrutura | 26/04/2026 |

---

## 🎯 Recomendação de execução

**Sequência ideal:**

1. **Próximas 3-4 semanas**: Nível 1 inteiro (Cadastro + Asaas + Trial + Gates + Assinatura)
2. **Cobrar primeiros 5-10 clientes** (Felipe + amigos/parceiros prováveis)
3. **Próximas 3 semanas**: Nível 2 (email, multi-user, notifs, LGPD)
4. **Próximas 4-5 semanas**: Nível 3 (CRM Inbox WhatsApp/Instagram) — diferencial Premium
5. **A partir daqui**: Nível 4 conforme cliente pedir

**Tempo total estimado:** ~3 meses pra ter SaaS completo e maduro.

**Não atacar:**
- Nível 3 antes do Nível 1 (cliente sem pagar não justifica esforço de Inbox)
- Nível 4 antes do Nível 3 (são features de cauda longa)

---

## 📌 Onde está documentado o quê

- **Bugs já resolvidos:** [`bugs.md`](./bugs.md) — incluindo BUG-020 e BUG-021 (opacity stacking context)
- **Decisões técnicas históricas:** [`decisoes-tecnicas.md`](./decisoes-tecnicas.md)
- **Pendências menores (não-roadmap):** [`pendencias.md`](./pendencias.md)
- **Status diário:** [`status-desenvolvimento.md`](./status-desenvolvimento.md)
- **Memory pessoal Claude:** `~/.claude/projects/-Users-uedson/memory/`
  - `project_smartgestao_crm_inbox.md` — detalhes do Inbox WhatsApp
  - `feedback_checksmart_deploy.md` — workflow de deploy
