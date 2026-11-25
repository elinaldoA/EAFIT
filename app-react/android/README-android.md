# App Android (Capacitor)

## Gerar e rodar
```
cd app-react
npm run cap:sync        # build nativo + copia para android/
npx cap open android    # abre no Android Studio; Run para instalar no celular
```
Os ícones/splash vêm de `python scripts/gen-android-icons.py`.

## Login com Google (obrigatório no Supabase)
Authentication > URL Configuration > Redirect URLs: adicionar
`br.com.eafit.app://auth`
Sem isso o Supabase recusa a volta do Google para o app.

## Links de e-mail abrindo o app (App Links)
O app declara `https://eafit.com.br/app` com `autoVerify`. Para o Android confiar,
publicar em `site-root/.well-known/assetlinks.json` (vai para
https://eafit.com.br/.well-known/assetlinks.json):
```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "br.com.eafit.app",
    "sha256_cert_fingerprints": ["AA:BB:...SHA-256 da chave de assinatura..."]
  }
}]
```
O SHA-256 sai de: `keytool -list -v -keystore SUA.keystore` (APK instalado por cabo usa
a chave de debug; o da Play Store, a "App signing key" no Play Console).
Sem o arquivo o link abre no navegador (o PWA), e o login pelo Google continua funcionando.
