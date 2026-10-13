# Chrome Web Store

Package: `frontend/public/garimppu-extensao.zip` (the same file the app offers for manual install). Rebuild it after
changing anything here and bump `version` in `manifest.json`:

```powershell
python extension/pack.py
```

After the store approves it, set `NEXT_PUBLIC_EXTENSION_STORE_URL` on garimppu-web so `/extensao` links to the store.

## Listing

- **Name:** Garimppu: mineração avançada
- **Category:** Productivity / Tools
- **Language:** Portuguese (Brazil)
- **Short description:** Envia para o Garimppu os anúncios que você vê ao rolar a Biblioteca de Anúncios do Meta.
- **Description:**
  Para quem usa o Garimppu. Abra uma busca na Biblioteca de Anúncios do Meta e role a página: cada anúncio que aparece
  vai para a sua conta no Garimppu, onde vira criativo, oferta e pontuação. Um contador no canto da página mostra
  quantos anúncios foram enviados e quantos são novos. Você controla a coleta: ela só acontece enquanto você rola.
  Requer uma conta no Garimppu e a chave gerada em app.garimppu.com/extensao.
- **Privacy policy:** https://app.garimppu.com/extensao-privacidade.html
- **Screenshots (1280x800):** the Ad Library with the counter visible, and the popup connected.

## Privacy tab

- **Single purpose:** send the public ads the user scrolls through on the Meta Ad Library to their Garimppu account.
- **storage:** keeps the user's Garimppu access key.
- **Host permission api.garimppu.com:** sends the ads to the user's account.
- **Content script on facebook.com/ads/library:** reads the ads the page itself loads; runs on no other page.
- **Remote code:** none.
- **Data collected:** website content (public ads), authentication information (the Garimppu key). Not sold, not used
  for anything unrelated to the single purpose.
