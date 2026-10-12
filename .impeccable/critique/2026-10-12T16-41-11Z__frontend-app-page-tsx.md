---
target: landing page (/ Explorar)
total_score: 24
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:C:\\Users\\Victor Hamber\\Desktop\\SPY\\frontend\\app\\page.tsx"
target_fingerprint: "sha256:226ebc30616c8e3bc5f8a1386326f3bbe8a524bc184121f8b1f847f03432e52f"
target_path: "C:\\Users\\Victor Hamber\\Desktop\\SPY\\frontend\\app\\page.tsx"
timestamp: 2026-10-12T16-41-11Z
slug: frontend-app-page-tsx
closed: true
---
# Crítica: página inicial (`/` Explorar)

Method: dual-agent (A: ecc90c64-aab3-4ad4-b91d-517860af7fb3 · B: 6f46149e-7f78-459d-8000-ce0b88f25714)

## Saúde do design (Nielsen): 24/40 — Aceitável

| # | Heurística | Nota | Problema principal |
|---|---|---|---|
| 1 | Visibilidade do status | 2 | "Carregando..." no vazio; sem data da última coleta; "0%" de crescimento sem explicação |
| 2 | Linguagem do usuário | 3 | Chip com chave crua `android:com.app99.driver`; siglas AN/MSG/TH; "3.83" sem escala |
| 3 | Controle e liberdade | 3 | Filtros na URL, "Limpar filtros"; menu de coleções não fecha com Esc |
| 4 | Consistência | 3 | Três modelos de aplicar filtro |
| 5 | Prevenção de erro | 2 | Enter no campo numérico descarta o valor; "Minerar" dispara raspagem sem confirmação |
| 6 | Reconhecer vs lembrar | 2 | Score só explicado em tooltip; oferta ausente no cartão |
| 7 | Flexibilidade | 2 | Sem atalhos, sem vista compacta |
| 8 | Estética e minimalismo | 3 | Âmbar demais; métrica morta |
| 9 | Recuperação de erro | 3 | Estado vazio ótimo; erro de carga com linguagem de dev |
| 10 | Ajuda | 1 | Nada explica score, limiares ou "sinais, não gasto" |

## Especificidade
Visual autoral (ardósia, mono tabular, faixa de métricas, selo-termômetro); estrutura genérica de "ad spy" (filtros + grade). Detector CLI: 0 achados. Detector no navegador: 475 em `/` (370 undersized-ui-text em siglas/legendas 10px, 48 nested-cards na faixa de métricas — intencional, 31 tiny-text pílula de nicho 11px, 22 low-contrast selo Ember branco 2,8:1, 3 placeholders 3,2:1), 3 em `?q=zzzz`, 48 com filtro de oferta.

## O que funciona
1. Estado vazio da busca com "Minerar "x" na Biblioteca".
2. Faixa de métricas com âmbar por limiar.
3. Filtros na URL e adaptação mobile.

## Problemas prioritários
1. [P1] Diferencial "oferta primeiro" ausente da home e dos cartões. Fix: linha de oferta no cartão; faixa "Ofertas em alta" ou `/ofertas` como home. (/impeccable shape)
2. [P1] Regra da lanterna quebrada: 48/48 selos Ember/âmbar; selo Ember 2,8:1. Fix: limiares relativos (top 5%/20%), texto Ore Ink no Ember, recalibrar "anúncios ≥5". (/impeccable colorize ou quieter)
3. [P1] Crescimento 7d morto (0% em 48/48). Fix: "—" + "1ª coleta" ou "visto há N d"; esconder ordenação sem histórico. (/impeccable clarify)
4. [P2] Três modelos de aplicar filtro; Enter descarta número. Fix: um modelo só. (/impeccable harden)
5. [P2] Sem foco visível (zero :focus-visible; .field sem outline); menu de coleções sem aria-expanded/Esc; estrela sem aria-pressed; <dd> antes de <dt>. (/impeccable audit, harden)
6. [P2] Densidade baixa: 16 controles antes do 1º cartão; ~6 cartões/tela desktop, 1,3 no celular; Ordenar escondido no mobile. (/impeccable layout)
7. [P2] Drill-down de oferta sem contexto (chave crua, título genérico). (/impeccable clarify)

## Personas
- Alex: Enter não aplica mínimo; sem atalhos; oferta exige sair da página.
- Sam: sem foco desenhado; menu sem estado/Esc; mídia anunciada como "Criativo #1 3.83 vídeo"; sem live regions.
- Casey: 1,3 cartão/tela; ordenar em 2 toques; CSV em espaço nobre; tooltips inexistentes no toque.
- Afiliado: top 10 de marcas grandes não afiliáveis; sem filtro de checkout; nichos errados.

## Observações menores
Subtítulo metodológico com link âmbar concorrente; "Filtrar coletados" abstrato; 5–6 siglas por cartão; vídeos sem capa pretos; nicho corta anunciante; "#1" em preto 70% fora da paleta; CSV com mesmo peso em 0 resultados; "Somente ativos" sem contagem do que esconde; qualidade de nicho/ranking afeta confiança.

## Perguntas
1. A home não deveria ser o ranking de ofertas?
2. Quando tudo brilha, para onde a lanterna aponta?
3. "Visto pela 1ª vez há N dias" não seria mais honesto que crescimento 7d sem histórico?
