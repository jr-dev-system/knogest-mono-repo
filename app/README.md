# KnoGest Mobile

Aplicação Expo do KnoGest. Neste momento ela contém somente a infraestrutura de
development build e a base visual compartilhada com o dashboard web; não
implementa fluxos de domínio ou integração com a API.

## Desenvolvimento

Use Node 22.13 ou superior e pnpm 10.

```bash
pnpm install
pnpm verify
pnpm prebuild
pnpm android
```

`pnpm android` compila e instala um development build no aparelho Android
conectado por USB, com a depuração USB autorizada. Depois da primeira
instalação, use `pnpm start` para iniciar o bundler para o development client.
Use `pnpm start:clear` quando Metro ou NativeWind precisarem de cache limpo.

O projeto também define `com.jrdevsystem.knogest.dev` para Android e iOS. O
comando `pnpm ios` está pronto para um iPhone por USB, mas esta máquina precisa
de Xcode 26.4 ou superior para o Expo SDK 57 antes de compilar iOS.

## Estilos e fontes

`global.css` é a fonte de verdade móvel dos tokens claros. Ele reproduz as
cores semânticas e o radius de
`../main-web-app/src/app/globals.css`; `pnpm test:theme` impede divergência
acidental. A escala Tailwind usa raiz de 16px para preservar as medidas do
dashboard no React Native.

NativeWind 5.0.0-rc.0 fornece as classes `className` e seus requisitos estão
fixados no `package.json`, incluindo `lightningcss` 1.30.1. O tema permanece
claro nesta etapa.

As fontes são arquivos TTF estáticos dos pacotes Expo Google Fonts e são
carregadas antes da primeira tela pelo `expo-font`:

- `font-sans`, `font-heading`: Inter
- `font-geist-sans`: Geist Sans
- `font-mono`: Geist Mono

Não use `font-bold` para trocar o peso de uma fonte customizada. Prefira
`font-sans-medium`, `font-sans-semibold` e `font-sans-bold`, que selecionam os
arquivos estáticos correspondentes.
