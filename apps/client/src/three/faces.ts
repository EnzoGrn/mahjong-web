/**
 * Tile faces as high-definition textures for the 3D scene.
 *
 * We start from the same SVG artwork as the rest of the game. Shapes are rendered through an SVG
 * image, and characters are drawn on the canvas with the font loaded by the page, so they look
 * the same on every device.
 */
import * as THREE from 'three';
import { TILE_SPRITE } from '../components/tileArt.ts';

const W = 300, H = 400; // 5× the size of the original drawing (60 × 80)

async function loadImage(src: string) {
  const img = new Image();
  img.decoding = 'async';
  img.src = src;
  await img.decode();
  return img;
}

export async function buildFaceTextures(renderer: THREE.WebGLRenderer): Promise<Record<string, THREE.Texture>> {
  await Promise.allSettled([
    document.fonts.load('900 40px "Noto Serif SC"', '萬中發東南西北一二三四五六七八九梅蘭菊竹春夏秋冬'),
    document.fonts.load('800 13px "Baloo 2"', '0123456789ESON'),
  ]);
  const doc = new DOMParser().parseFromString(TILE_SPRITE, 'image/svg+xml');
  const out: Record<string, THREE.Texture> = {};
  const aniso = renderer.capabilities.getMaxAnisotropy();
  const jobs = Array.from(doc.querySelectorAll('symbol')).map(async (sym) => {
    const k = sym.id.replace(/^t-/, '');
    const texts = Array.from(sym.querySelectorAll('text'));
    const glyphs = texts.map((t) => ({
      x: Number(t.getAttribute('x')), y: Number(t.getAttribute('y')),
      size: Number(t.getAttribute('font-size')), fill: t.getAttribute('fill') ?? '#000',
      anchor: t.getAttribute('text-anchor') ?? 'start',
      cjk: (t.getAttribute('style') ?? '').includes('Noto Serif SC'),
      weight: t.getAttribute('font-weight') ?? '900', text: t.textContent ?? '',
    }));
    texts.forEach((t) => t.remove());
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 80" width="${W}" height="${H}">${sym.innerHTML}</svg>`;
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d')!;
    const img = await loadImage('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg));
    ctx.drawImage(img, 0, 0, W, H);
    const sx = W / 60;
    for (const g of glyphs) {
      ctx.fillStyle = g.fill;
      ctx.textAlign = g.anchor === 'middle' ? 'center' : 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.font = g.cjk
        ? `900 ${g.size * sx}px "Noto Serif SC", "Songti SC", "SimSun", serif`
        : `${g.weight} ${g.size * sx}px "Baloo 2", system-ui, sans-serif`;
      ctx.fillText(g.text, g.x * sx, g.y * sx);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = aniso;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    out[k] = tex;
  });
  await Promise.all(jobs);
  return out;
}

/** Small felt texture: soft gradient and light grain. */
export function feltTexture(): THREE.Texture {
  const s = 1024;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(s / 2, s / 2, s * 0.05, s / 2, s / 2, s * 0.75);
  g.addColorStop(0, '#2f75b0');
  g.addColorStop(0.6, '#205a91');
  g.addColorStop(1, '#163f6b');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  const data = ctx.getImageData(0, 0, s, s);
  for (let i = 0; i < data.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 10;
    data.data[i] += n; data.data[i + 1] += n; data.data[i + 2] += n;
  }
  ctx.putImageData(data, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
