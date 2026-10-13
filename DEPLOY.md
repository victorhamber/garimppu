# Deploy do Garimppu no EasyPanel

São três serviços no mesmo projeto do EasyPanel:

| Serviço | Tipo | Origem | Porta | Domínio sugerido |
| --- | --- | --- | --- | --- |
| `garimppu-db` | Postgres | modelo do EasyPanel | 5432 (interna) | nenhum |
| `garimppu-api` | App | este repositório, Build Path `/backend` | 8000 | `api.garimppu.com` |
| `garimppu-web` | App | este repositório, Build Path `/frontend` | 3000 | `app.garimppu.com` |

O banco é Postgres. As imagens baixadas dos anúncios ficam num volume montado em `/app/data` da API.
Não precisa de Redis: as coletas e o agendador rodam dentro da própria API.

> O painel e a API precisam ficar no **mesmo domínio principal** (`app.garimppu.com` e `api.garimppu.com`).
> É isso que permite o cookie de login funcionar entre os dois.

## 1. DNS

No provedor do domínio, crie dois registros **A** apontando para o IP da VPS:

- `app` → IP da VPS
- `api` → IP da VPS

O EasyPanel gera o HTTPS sozinho quando o domínio já aponta para a VPS.

## 2. Repositório

O código está em **https://github.com/victorhamber/garimppu** (privado).
No EasyPanel, em **Settings → GitHub**, conecte sua conta do GitHub para ele conseguir ler repositórios privados.

## 3. Banco (`garimppu-db`)

1. No projeto, **+ Service → Postgres**, nome `garimppu-db`. Deixe o EasyPanel gerar a senha.
2. Depois de criado, abra o serviço e copie a **Internal Connection URL**
   (algo como `postgres://postgres:SENHA@<projeto>_garimppu-db:5432/<projeto>`).
   Ela só funciona de dentro da VPS, que é o que queremos: o banco não fica exposto na internet.

Não precisa criar tabelas: a API cria e atualiza tudo sozinha ao iniciar.

## 4. API (`garimppu-api`)

1. **+ Service → App**, nome `garimppu-api`.
2. **Source → GitHub**: owner `victorhamber`, repositório `garimppu`, branch `main`, **Build Path** `/backend`.
3. **Build**: tipo **Dockerfile** (arquivo `Dockerfile`).
4. **Environment** (cole a URL copiada no passo 3 como está, com `postgres://`):
   ```
   DATABASE_URL=postgres://postgres:SENHA@<projeto>_garimppu-db:5432/<projeto>
   APP_URL=https://app.garimppu.com
   API_PUBLIC_URL=https://api.garimppu.com
   COOKIE_SECURE=true
   ```
   Opcional: `META_ACCESS_TOKEN=` (token da API da Biblioteca de Anúncios).
   Opcional: `ADMIN_EMAIL=` e `ADMIN_PASSWORD=`. A cada início, a API garante essa conta de administrador
   com essa senha. Para trocar a senha, mude a variável e clique em **Deploy**.
   Opcional: `YOUTUBE_API_KEY=` para a aba **Vídeos** (veja [YouTube](#youtube)).
5. **Mounts → Add Volume**: nome `garimppu-media`, **Mount Path** `/app/data`.
   Sem esse volume, as imagens dos anúncios somem a cada deploy.
6. **Domains**: `api.garimppu.com`, porta **8000**, HTTPS ligado.
7. **Deploy**. A primeira subida baixa a imagem do Playwright (com o Chromium da coleta) e demora alguns minutos.
   As migrações do banco rodam sozinhas a cada inicialização.
8. Confira: `https://api.garimppu.com/api/health` deve responder `{"status":"ok"}`.

> Mantenha **1 réplica**. As coletas e o agendador rodam dentro da API; duas réplicas coletariam em dobro.

## 5. Primeiro acesso

Escolha **um** dos dois caminhos.

### a) Começar do zero

No serviço `garimppu-api`, abra **Console** (terminal do container) e rode:

```sh
python -m app.create_admin contato@victorhamber.com --senha-provisoria
```

A senha provisória aparece na tela. Troque depois em **Minha conta**.

### b) Levar os dados do computador

Leva buscas, anúncios, criativos, coleções, sua conta de administrador e as configurações de webhook e e-mail.
A cópia só roda com o Postgres vazio, então faça isso **antes** de criar qualquer conta no servidor.

1. No computador, pare o backend e gere uma cópia consistente do banco local:
   ```powershell
   cd backend
   .\.venv\Scripts\python -c "import sqlite3; s=sqlite3.connect('data/miner.db'); d=sqlite3.connect('data/miner-export.db'); s.backup(d); d.close()"
   ```
2. Envie a cópia e as imagens para o volume da API. Na VPS, ele fica em
   `/etc/easypanel/projects/<projeto>/garimppu-api/volumes/garimppu-media/`:
   ```powershell
   scp backend\data\miner-export.db root@IP_DA_VPS:/etc/easypanel/projects/<projeto>/garimppu-api/volumes/garimppu-media/
   scp -r backend\data\media root@IP_DA_VPS:/etc/easypanel/projects/<projeto>/garimppu-api/volumes/garimppu-media/
   ```
3. No **Console** do `garimppu-api`:
   ```sh
   python -m app.import_sqlite data/miner-export.db
   rm data/miner-export.db
   ```
   O comando mostra quantas linhas copiou de cada tabela. Entre com o mesmo e-mail e senha que você usa no computador.

## 6. Painel (`garimppu-web`)

1. **+ Service → App**, nome `garimppu-web`.
2. **Source → GitHub**: mesmo repositório, branch `main`, **Build Path** `/frontend`.
3. **Build**: tipo **Dockerfile**. Em **Build Args** (não em Environment):
   ```
   NEXT_PUBLIC_API_URL=https://api.garimppu.com
   ```
   Esse valor entra no código do navegador durante o build. Se mudar a URL da API, faça **Rebuild**.
4. **Domains**: `app.garimppu.com`, porta **3000**, HTTPS ligado.
5. **Deploy** e acesse `https://app.garimppu.com`.

## 7. Configurar pelo painel

Entre como administrador e abra **Licenças** (menu da conta, canto superior direito):

1. **E-mail**: escolha Resend (ou SMTP), cole a chave, preencha o remetente e clique em **Salvar e enviar teste**.
   No Resend, o domínio do remetente (ex.: `garimppu.com`) precisa estar verificado.
2. **Webhook de compra**: clique em **Gerar URL do webhook**, preencha os códigos do produto e os dias de acesso,
   e cadastre a URL na Hotmart, Kiwify ou Cakto (o passo a passo está na própria tela).
3. Use o botão de teste da plataforma e confira o evento em **Últimas notificações recebidas**.

## YouTube

A aba **Vídeos** usa a API oficial do YouTube (grátis, 10.000 unidades de cota por dia).

1. Em [console.cloud.google.com](https://console.cloud.google.com), crie um projeto (ou use um existente).
2. **APIs e serviços → Biblioteca**: procure **YouTube Data API v3** e clique em **Ativar**.
3. **APIs e serviços → Credenciais → Criar credenciais → Chave de API**. Copie a chave.
   Recomendado: em **Restrições de API**, deixe a chave liberada só para a YouTube Data API v3.
4. No EasyPanel, serviço `garimppu-api` → **Environment**: `YOUTUBE_API_KEY=<a chave>` → **Deploy**.

Cada coleta de 100 vídeos gasta cerca de 200 unidades, então dá para ~50 coletas por dia somando todos os clientes.
Se a cota acabar, a coleta mostra o aviso e volta a funcionar quando o Google zera a cota (4h ou 5h em Brasília).

## TikTok

A aba **TikTok** não precisa de chave: usa o Chromium do Playwright, que já vem na imagem da API, para abrir o
TikTok Creative Center e depois consulta os Top Ads por HTTP. `TIKTOK_MAX_RESULTS` (padrão 200) limita cada coleta.
Se o TikTok mudar a página, a coleta termina em erro com a mensagem no log da busca.

## Sites (Cloudflare Radar)

A aba **Sites** usa a API gratuita do Cloudflare Radar:

1. Entre em [dash.cloudflare.com](https://dash.cloudflare.com) (a conta gratuita serve).
2. **Meu perfil → Tokens de API → Criar token → Token personalizado**.
3. Em **Permissões**: *Conta* → *Radar* → *Ler*. Crie e copie o token.
4. No EasyPanel, serviço `garimppu-api` → **Environment**: `CLOUDFLARE_API_TOKEN=<o token>` → **Deploy**.

Sem o token, a aba mostra um aviso e o Minerar recusa buscas de sites.

## Palavras-chave (Google Trends)

A aba **Palavras-chave** não precisa de chave: lê o feed RSS público do Google Trends. As buscas desse tipo são
recoletadas a cada hora pelo agendador (`ENABLE_SCHEDULER` ligado na API); `TRENDS_REFRESH_HOURS` muda o intervalo.
Essas coletas não gastam o limite de `MAX_RUNS_PER_HOUR` do Meta (é um único pedido por país).

## Atualizações

Cada `git push` na branch `main` pode disparar o deploy automático (ative **Auto Deploy** nos dois apps).
Ao atualizar, a API aplica as migrações novas sozinha ao iniciar.

## Backup

- **Banco**: no serviço `garimppu-db`, aba **Backups**, agende um backup diário (para S3 ou compatível).
- **Imagens**: o volume `garimppu-media`. Perder as imagens não quebra nada: as próximas coletas baixam de novo.

## Solução de problemas

| Sintoma | Causa provável |
| --- | --- |
| API reinicia com "Banco indisponível" nos logs | `DATABASE_URL` errado, ou `garimppu-db` parado |
| Login volta sempre para a tela de entrar | `COOKIE_SECURE=true` sem HTTPS, ou painel e API em domínios principais diferentes |
| Erro de CORS no console do navegador | `APP_URL` da API diferente do endereço real do painel |
| Painel não carrega nada | `NEXT_PUBLIC_API_URL` errado no **Build Args**; corrija e faça **Rebuild** do `garimppu-web` |
| E-mails com link para `localhost` | `APP_URL` / `API_PUBLIC_URL` não configurados na API |
| `import_sqlite` diz que o Postgres já tem dados | Alguém já entrou ou foi criado no servidor; a cópia só roda num banco vazio |
| Coletas falham sempre | Veja os **Logs** do `garimppu-api`; a Meta pode ter mudado a página ou bloqueado o IP |
| Imagens sumiram após deploy | Volume não montado em `/app/data` |
