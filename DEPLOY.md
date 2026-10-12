# Deploy do Garimppu no EasyPanel

São dois apps no mesmo projeto do EasyPanel, os dois construídos a partir deste repositório:

| App | Pasta (Build Path) | Porta | Domínio sugerido |
| --- | --- | --- | --- |
| `garimppu-api` | `/backend` | 8000 | `api.garimppu.com` |
| `garimppu-web` | `/frontend` | 3000 | `app.garimppu.com` |

O banco é SQLite e fica, junto com as imagens baixadas dos anúncios, num volume montado em `/app/data` da API.
Não precisa criar Postgres nem Redis: as coletas e o agendador rodam dentro da própria API.

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

## 3. API (`garimppu-api`)

1. No projeto, **+ Service → App**, nome `garimppu-api`.
2. **Source → GitHub**: owner `victorhamber`, repositório `garimppu`, branch `main`, **Build Path** `/backend`.
3. **Build**: tipo **Dockerfile** (arquivo `Dockerfile`).
4. **Environment**:
   ```
   APP_URL=https://app.garimppu.com
   API_PUBLIC_URL=https://api.garimppu.com
   COOKIE_SECURE=true
   ```
   Opcional: `META_ACCESS_TOKEN=` (token da API da Biblioteca de Anúncios).
5. **Mounts → Add Volume**: nome `garimppu-data`, **Mount Path** `/app/data`.
   Sem esse volume, o banco e as imagens somem a cada deploy.
6. **Domains**: `api.garimppu.com`, porta **8000**, HTTPS ligado.
7. **Deploy**. A primeira subida baixa a imagem do Playwright (com o Chromium da coleta) e demora alguns minutos.
   As migrações do banco rodam sozinhas a cada inicialização.
8. Confira: `https://api.garimppu.com/api/health` deve responder `{"status":"ok"}`.

> Mantenha **1 réplica**. As coletas e o agendador rodam dentro da API; duas réplicas coletariam em dobro.

### Criar o administrador

No serviço `garimppu-api`, abra **Console** (terminal do container) e rode:

```sh
python -m app.create_admin contato@victorhamber.com --senha-provisoria
```

A senha provisória aparece na tela. Troque depois em **Minha conta**.

## 4. Painel (`garimppu-web`)

1. **+ Service → App**, nome `garimppu-web`.
2. **Source → GitHub**: mesmo repositório, branch `main`, **Build Path** `/frontend`.
3. **Build**: tipo **Dockerfile**. Em **Build Args** (não em Environment):
   ```
   NEXT_PUBLIC_API_URL=https://api.garimppu.com
   ```
   Esse valor entra no código do navegador durante o build. Se mudar a URL da API, faça **Rebuild**.
4. **Domains**: `app.garimppu.com`, porta **3000**, HTTPS ligado.
5. **Deploy** e acesse `https://app.garimppu.com`.

## 5. Configurar pelo painel

Entre como administrador e abra **Licenças** (menu da conta, canto superior direito):

1. **E-mail**: escolha Resend (ou SMTP), cole a chave, preencha o remetente e clique em **Salvar e enviar teste**.
   No Resend, o domínio do remetente (ex.: `garimppu.com`) precisa estar verificado.
2. **Webhook de compra**: clique em **Gerar URL do webhook**, preencha os códigos do produto e os dias de acesso,
   e cadastre a URL na Hotmart, Kiwify ou Cakto (o passo a passo está na própria tela).
3. Use o botão de teste da plataforma e confira o evento em **Últimas notificações recebidas**.

## 6. Levar os dados locais (opcional)

Para começar em produção com as buscas e anúncios que você já minerou no computador:

1. No computador, pare o backend e faça uma cópia consistente do banco
   (o arquivo `backend/data/miner.db` sozinho pode estar desatualizado por causa do modo WAL):
   ```powershell
   cd backend
   .\.venv\Scripts\python -c "import sqlite3; s=sqlite3.connect('data/miner.db'); d=sqlite3.connect('data/miner-export.db'); s.backup(d); d.close()"
   ```
2. No EasyPanel, pare o `garimppu-api` (**Stop**).
3. Envie `miner-export.db` (renomeado para `miner.db`) e a pasta `backend/data/media` para o volume.
   Na VPS, o volume fica em `/etc/easypanel/projects/<projeto>/garimppu-api/volumes/garimppu-data/`:
   ```powershell
   scp backend\data\miner-export.db root@IP_DA_VPS:/etc/easypanel/projects/<projeto>/garimppu-api/volumes/garimppu-data/miner.db
   scp -r backend\data\media root@IP_DA_VPS:/etc/easypanel/projects/<projeto>/garimppu-api/volumes/garimppu-data/
   ```
4. **Start** no serviço. Sua conta de administrador local vem junto; não precisa rodar o `create_admin`.

## Atualizações

Cada `git push` na branch `main` pode disparar o deploy automático (ative **Auto Deploy** nos dois apps).
Ao atualizar, a API aplica as migrações novas sozinha ao iniciar.

## Backup

Tudo o que importa está no volume `garimppu-data` (`miner.db` e `media/`). Faça backup dele com frequência,
por exemplo com o backup de volumes do EasyPanel ou copiando a pasta da VPS.

## Solução de problemas

| Sintoma | Causa provável |
| --- | --- |
| Login volta sempre para a tela de entrar | `COOKIE_SECURE=true` sem HTTPS, ou painel e API em domínios principais diferentes |
| Erro de CORS no console do navegador | `APP_URL` da API diferente do endereço real do painel |
| Painel não carrega nada | `NEXT_PUBLIC_API_URL` errado no **Build Args**; corrija e faça **Rebuild** do `garimppu-web` |
| E-mails com link para `localhost` | `APP_URL` / `API_PUBLIC_URL` não configurados na API |
| Coletas falham sempre | Veja os **Logs** do `garimppu-api`; a Meta pode ter mudado a página ou bloqueado o IP |
| Dados sumiram após deploy | Volume não montado em `/app/data` |
