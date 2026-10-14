# Chrome Web Store

Package: `frontend/public/garimppu-extensao.zip` (the same file the app offers for manual install). Rebuild it after
changing anything here and bump `version` in `manifest.json`:

```powershell
python extension/pack.py
```

After the store approves it, set `NEXT_PUBLIC_EXTENSION_STORE_URL` on garimppu-web so `/extensao` links to the store.
Set `EXTENSION_UPGRADE_URL` on garimppu-api to the sales page the free plan's "Assine" links open.

## Listing

- **Name:** Garimppu: mineração de anúncios
- **Category:** Productivity / Tools
- **Language:** Portuguese (Brazil)
- **Short description:** Filtra os anúncios bons da Biblioteca de Anúncios do Meta, baixa os criativos e envia tudo para o Garimppu.
- **Description:**
  Pare de perder tempo com anúncios fracos na Biblioteca de Anúncios do Meta. Defina quantos dias no ar, quantos
  anúncios com o mesmo criativo e quantos anúncios do anunciante você quer ver: o resto fica apagado enquanto você rola.
  Cada anúncio ganha um botão para baixar a imagem ou o vídeo. Grátis com seu e-mail. Assinantes do Garimppu também
  enviam os anúncios filtrados e os favoritos direto para a conta, onde viram criativos, ofertas e pontuação.
- **Privacy policy:** https://app.garimppu.com/extensao-privacidade.html
- **Screenshots (1280x800):** cards with Baixar/Favoritar and the dimmed ones, the counter, the popup with filters.

## Privacy tab

- **Single purpose:** help the user find strong ads on the Meta Ad Library: filter them, download their media and save
  them to the user's Garimppu account.
- **storage:** the user's e-mail, filters and Garimppu session.
- **downloads:** the Baixar button saves the ad's image or video.
- **Host permission api.garimppu.com:** registers the e-mail and sends ads and favorites to the user's account.
- **Content script on facebook.com/ads/library:** reads the ads the page itself loads and adds the buttons; runs on no
  other Facebook page.
- **Content script on app.garimppu.com:** only flags that the extension is installed.
- **Remote code:** none.
- **Data collected:** personally identifiable information (e-mail), authentication information (session), website
  content (public ads). Not sold, not used for anything unrelated to the single purpose.
