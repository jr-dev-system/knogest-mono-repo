import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const webTokensPath = resolve(
  currentDirectory,
  '../../main-web-app/src/app/globals.css',
);
const mobileTokensPath = resolve(currentDirectory, '../global.css');

const tokenNames = [
  'background',
  'foreground',
  'card',
  'card-foreground',
  'popover',
  'popover-foreground',
  'primary',
  'primary-foreground',
  'secondary',
  'secondary-foreground',
  'muted',
  'muted-foreground',
  'accent',
  'accent-foreground',
  'destructive',
  'border',
  'input',
  'ring',
  'chart-1',
  'chart-2',
  'chart-3',
  'chart-4',
  'chart-5',
  'sidebar',
  'sidebar-foreground',
  'sidebar-primary',
  'sidebar-primary-foreground',
  'sidebar-accent',
  'sidebar-accent-foreground',
  'sidebar-border',
  'sidebar-ring',
];

function readToken(css, tokenName) {
  const pattern = new RegExp(`--${tokenName}:\\s*([^;]+);`);
  return css.match(pattern)?.[1]?.trim();
}

const [webCss, mobileCss] = await Promise.all([
  readFile(webTokensPath, 'utf8'),
  readFile(mobileTokensPath, 'utf8'),
]);

const lightWebCss = webCss.split('\n.dark')[0];
const mismatches = tokenNames.flatMap((tokenName) => {
  const webValue = readToken(lightWebCss, tokenName);
  const mobileValue = readToken(mobileCss, `color-${tokenName}`);

  return webValue === mobileValue
    ? []
    : [`${tokenName}: web=${webValue ?? 'missing'}, mobile=${mobileValue ?? 'missing'}`];
});

const radius = readToken(lightWebCss, 'radius');
const mobileRadius = readToken(mobileCss, 'radius');
if (radius !== mobileRadius) {
  mismatches.push(`radius: web=${radius ?? 'missing'}, mobile=${mobileRadius ?? 'missing'}`);
}

if (mismatches.length > 0) {
  console.error('Mobile styling tokens differ from the web light theme:');
  for (const mismatch of mismatches) {
    console.error(`- ${mismatch}`);
  }
  process.exitCode = 1;
} else {
  console.log(`Verified ${tokenNames.length} semantic colors and radius against the web light theme.`);
}
