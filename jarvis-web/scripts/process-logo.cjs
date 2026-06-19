const sharp = require("sharp");
const path = require("path");
const fs = require("fs");

const assetsDir = path.join(__dirname, "../src/assets");
const iconsDir = path.join(__dirname, "../public/icons");
const publicDir = path.join(__dirname, "../public");
const srcPath = path.join(assetsDir, "logo-source.png");

const SITE_BG = "#0f0f13";
// logo-source.png tem fundo branco neutro (sem cor); o ícone é roxo saturado.
// Usamos "chroma" (max-min entre R,G,B) em vez de luminância: fundo branco tem
// chroma ~0, o ícone (até nas bordas do brilho) tem chroma alto.
const LOW = 8;
const HIGH = 60;

async function makeTransparent() {
  const { data, info } = await sharp(srcPath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  const alphaBuf = Buffer.alloc(width * height);
  for (let p = 0, i = 0; i < data.length; i += channels, p++) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const chroma = Math.max(r, g, b) - Math.min(r, g, b);
    const factor = Math.max(0, Math.min(1, (chroma - LOW) / (HIGH - LOW)));
    alphaBuf[p] = Math.round(factor * 255);
  }

  const out = Buffer.alloc(data.length);
  for (let p = 0, i = 0; i < data.length; i += channels, p++) {
    out[i] = data[i];
    out[i + 1] = data[i + 1];
    out[i + 2] = data[i + 2];
    out[i + 3] = alphaBuf[p];
  }

  return sharp(out, { raw: { width, height, channels } }).png().toBuffer();
}

async function makeCircularFavicon(transparentBuffer, size) {
  const padding = Math.round(size * 0.14);
  const inner = size - padding * 2;

  const circleSvg = `<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="${SITE_BG}"/></svg>`;
  const circleBg = await sharp(Buffer.from(circleSvg)).png().toBuffer();
  const logoResized = await sharp(transparentBuffer).resize(inner, inner, { fit: "contain" }).toBuffer();

  return sharp(circleBg).composite([{ input: logoResized, gravity: "center" }]).png().toBuffer();
}

async function makeHomeIcon(transparentBuffer, size) {
  const padding = Math.round(size * 0.16);
  const inner = size - padding * 2;

  const logoResized = await sharp(transparentBuffer).resize(inner, inner, { fit: "contain" }).toBuffer();
  return sharp({ create: { width: size, height: size, channels: 4, background: "#000000" } })
    .composite([{ input: logoResized, gravity: "center" }])
    .png()
    .toBuffer();
}

(async () => {
  const transparentBuffer = await makeTransparent();
  const transparentSmall = await sharp(transparentBuffer).resize(400, 400, { fit: "contain" }).png({ compressionLevel: 9 }).toBuffer();
  fs.writeFileSync(path.join(assetsDir, "logo-transparent.png"), transparentSmall);
  console.log("✅ src/assets/logo-transparent.png (avatares do app, sem fundo)");

  for (const size of [32, 192]) {
    const buf = await makeCircularFavicon(transparentBuffer, size);
    fs.writeFileSync(path.join(publicDir, `favicon-${size}.png`), buf);
    console.log(`✅ favicon-${size}.png (circular, fundo do site)`);
  }

  for (const { name, size } of [
    { name: "apple-touch-icon.png", size: 180 },
    { name: "icon-192.png", size: 192 },
    { name: "icon-512.png", size: 512 },
  ]) {
    const buf = await makeHomeIcon(transparentBuffer, size);
    fs.writeFileSync(path.join(iconsDir, name), buf);
    console.log(`✅ icons/${name} (fundo preto, tela inicial)`);
  }
})();
