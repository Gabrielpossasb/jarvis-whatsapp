const sharp = require("sharp");
const path = require("path");

const src = path.join(__dirname, "../src/assets/logo-source.png");
const iconsDir = path.join(__dirname, "../public/icons");
const publicDir = path.join(__dirname, "../public");

const sizes = [
  { name: "apple-touch-icon.png", size: 180, dir: iconsDir },
  { name: "icon-192.png", size: 192, dir: iconsDir },
  { name: "icon-512.png", size: 512, dir: iconsDir },
  { name: "favicon-32.png", size: 32, dir: publicDir },
  { name: "favicon-192.png", size: 192, dir: publicDir },
];

(async () => {
  for (const { name, size, dir } of sizes) {
    await sharp(src).resize(size, size).png().toFile(path.join(dir, name));
    console.log(`✅ ${name} (${size}x${size})`);
  }
})();
