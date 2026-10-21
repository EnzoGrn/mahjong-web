/**
 * The mahjong table in real 3D (Three.js / WebGL).
 *
 * Frame: 1 unit = 100 px of the original drawing. x to the right, z towards you, y up.
 * Each player has a local frame (yours rotated by 90°, 180° or 270° around the centre):
 * their discards in front of the console, their standing hand and melds at the table edge.
 *
 * The scene receives a full state on every change (update) and animates the tiles itself:
 * a new tile starts from its player's hand, a claimed tile flies from the discards to the meld.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { buildFaceTextures, feltTexture } from './faces.ts';

export interface SeatState {
  discards: string[];
  melds: { tiles: string[]; claimed?: string }[];
  flowers: string[];
  standing: number;
  justDrew: boolean;
  revealed?: string[];
  /** Your hand (position 0 only), face up, and the selected tile. */
  hand?: string[];
  selected?: number;
  /** Tiles of your hand that, once discarded, leave you waiting (hint). */
  ready?: boolean[];
}

/** Table points on screen (px), to lay the 2D UI on top. */
export interface Anchors {
  plate: { x: number; y: number }[];   // by relative position
  banner: { x: number; y: number }[];
  center: { x: number; y: number };
  handTop: number;                     // top of your hand
}

export interface TableState {
  /** By relative position: 0 you, 1 right, 2 across, 3 left. */
  seats: SeatState[];
  focus: number;          // relative position of the awaited player, -1 if none
  lastDiscard: number;    // relative position of the author of the live discard, -1 otherwise
  wallCount: number;
  dice: number[];
  winds: string[];        // wind character of each position
  dealer: number;
}

/* Dimensions (units) */
const TW = 0.46, TL = 0.61, TT = 0.31;          // tile width, length, thickness
const MELD = 0.74, FLOWER = 0.52;                // scale of melds and flowers
const YAW = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
const POOL = { x0: -0.89 + TW / 2, z0: 0.89 + TL / 2, dx: 0.47, dz: 0.68, cols: 8 };
const EDGE_Z = 3.84;                            // each player's edge (hands, melds)
const TABLE = 4.8;                              // half side of the felt
const HAND = 1.32, HAND_Z = 4.22;               // your hand: scale and row
const HAND_STEP = TW * HAND + 0.02;
const SPLIT = -TT / 2 + TT * 0.36;              // boundary between the orange back and the ivory

type Want = { key: string; kind: string; pose: Pose; spawn: number; glow?: THREE.Material; i?: number; mark?: boolean };
type Pose = { pos: THREE.Vector3; quat: THREE.Quaternion; scale: number };

interface TileObj {
  key: string;
  kind: string;          // tile code, or 'back'
  group: THREE.Group;
  glow?: THREE.Mesh;
  mark?: THREE.Mesh;
  from?: Pose; to: Pose; t0: number; dur: number; arc: number;
}

const ease = (t: number) => 1 - Math.pow(1 - t, 3);

export class MahjongScene {
  readonly renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  private faces: Record<string, THREE.Texture> = {};
  private faceMats: Record<string, THREE.Material> = {};
  private tiles = new Map<string, TileObj>();
  private state: TableState | null = null;
  private ready: Promise<void>;
  private raf = 0;
  private consoleTex: THREE.CanvasTexture;
  private consoleCanvas = document.createElement('canvas');
  private zones: THREE.Mesh[] = [];
  private width = 1; private height = 1;
  private tileGeo = new RoundedBoxGeometry(TW, TT, TL, 6, 0.06);
  private glowGeo: THREE.ShapeGeometry;
  private elev = THREE.MathUtils.degToRad(50);
  private hover = -1;
  private raycaster = new THREE.Raycaster();
  /** Called when a tile of your hand is tapped. */
  onHandTap?: (i: number) => void;
  /** Called when the framing changes. */
  onFrame?: (a: Anchors) => void;
  private markGeo = new THREE.CircleGeometry(0.045, 20);
  private markMat = new THREE.MeshBasicMaterial({ color: '#3fd07a' });
  private glowMat = new THREE.MeshBasicMaterial({ color: '#ffc94a', transparent: true, opacity: 0.9, depthWrite: false });
  private takenMat = new THREE.MeshBasicMaterial({ color: '#ffc94a', transparent: true, opacity: 0.45, depthWrite: false });

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.glowGeo = new THREE.ShapeGeometry(roundedRect(TW + 0.12, TL + 0.12, 0.09));
    this.consoleCanvas.width = this.consoleCanvas.height = 512;
    this.consoleTex = new THREE.CanvasTexture(this.consoleCanvas);
    this.consoleTex.colorSpace = THREE.SRGBColorSpace;
    this.consoleTex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    this.buildTable();
    this.ready = buildFaceTextures(this.renderer).then((f) => { this.faces = f; });
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
    canvas.addEventListener('pointermove', this.onMove);
    canvas.addEventListener('pointerleave', this.onLeave);
    canvas.addEventListener('pointerdown', this.onDown);
  }

  /* -------------------------------------------------------------- */
  /* Tapping your hand                                               */
  /* -------------------------------------------------------------- */

  private pick(e: PointerEvent): number {
    const r = this.canvas.getBoundingClientRect();
    const v = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(v, this.camera);
    const meshes: THREE.Object3D[] = [];
    for (const o of this.tiles.values()) if (o.key.startsWith('me')) meshes.push(o.group.children[0]);
    const hit = this.raycaster.intersectObjects(meshes, false)[0];
    return hit ? (hit.object.parent!.userData.i as number) : -1;
  }
  /** Screen position (px in the canvas) of tile i of your hand, for tests. */
  handPoint(i: number) {
    for (const o of this.tiles.values()) if (o.key.startsWith('me') && o.group.userData.i === i) {
      const q = o.to.pos.clone().project(this.camera);
      return { x: ((q.x + 1) / 2) * this.width, y: ((1 - q.y) / 2) * this.height };
    }
    return null;
  }
  private onMove = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    const i = this.pick(e);
    this.canvas.style.cursor = i >= 0 ? 'pointer' : '';
    if (i !== this.hover) { this.hover = i; if (this.state) this.update(this.state); }
  };
  private onLeave = () => { if (this.hover >= 0) { this.hover = -1; if (this.state) this.update(this.state); } };
  private onDown = (e: PointerEvent) => { const i = this.pick(e); if (i >= 0) this.onHandTap?.(i); };

  /* -------------------------------------------------------------- */
  /* Scenery                                                         */
  /* -------------------------------------------------------------- */

  private buildTable() {
    const s = this.scene;
    s.add(new THREE.HemisphereLight('#ffffff', '#3a5a80', 1.1));
    const sun = new THREE.DirectionalLight('#fff4e0', 2.2);
    sun.position.set(-3.5, 11, 6.5);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -6.5, right: 6.5, top: 6.5, bottom: -6.5, near: 1, far: 30 });
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.02;
    sun.shadow.radius = 4;
    s.add(sun);

    // Table body
    const body = new THREE.Mesh(new RoundedBoxGeometry(10.6, 0.7, 10.6, 6, 0.4),
      new THREE.MeshStandardMaterial({ color: '#141b20', roughness: 0.55, metalness: 0.15 }));
    body.position.y = -0.36;
    body.receiveShadow = true;
    s.add(body);
    // Raised rim around the felt
    const outer = roundedRect(10.4, 10.4, 0.55);
    outer.holes.push(roundedRect(9.62, 9.62, 0.38));
    const rim = new THREE.Mesh(new THREE.ExtrudeGeometry(outer, { depth: 0.1, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 4, curveSegments: 16 }),
      new THREE.MeshStandardMaterial({ color: '#222c33', roughness: 0.4, metalness: 0.25 }));
    rim.rotation.x = -Math.PI / 2;
    rim.position.y = -0.02;
    rim.castShadow = true;
    rim.receiveShadow = true;
    s.add(rim);
    // Gold line and felt
    const gold = new THREE.Mesh(new THREE.ShapeGeometry(roundedRect(9.62, 9.62, 0.38), 16),
      new THREE.MeshStandardMaterial({ color: '#d6a746', roughness: 0.35, metalness: 0.6 }));
    gold.rotation.x = -Math.PI / 2;
    gold.position.y = -0.004;
    s.add(gold);
    const felt = new THREE.Mesh(new THREE.ShapeGeometry(roundedRect(TABLE * 2, TABLE * 2, 0.3), 16),
      new THREE.MeshStandardMaterial({ map: feltTexture(), roughness: 0.95, metalness: 0 }));
    felt.rotation.x = -Math.PI / 2;
    felt.receiveShadow = true;
    fixUv(felt.geometry as THREE.ShapeGeometry, TABLE * 2);
    s.add(felt);

    // Each player's discard area
    for (let r = 0; r < 4; r++) {
      const z = new THREE.Mesh(new THREE.ShapeGeometry(roundedRect(3.88, 2.78, 0.14), 8),
        new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.12, depthWrite: false }));
      z.rotation.x = -Math.PI / 2;
      const p = local(r, 0.99, 2.22);
      z.position.set(p.x, 0.002, p.z);
      z.rotation.z = YAW[r];
      s.add(z);
      this.zones.push(z);
    }

    // Central console
    const cons = new THREE.Mesh(new RoundedBoxGeometry(1.72, 0.2, 1.72, 6, 0.08),
      new THREE.MeshStandardMaterial({ color: '#1c2429', roughness: 0.35, metalness: 0.3 }));
    cons.position.y = 0.1;
    cons.castShadow = true;
    cons.receiveShadow = true;
    s.add(cons);
    const top = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6),
      new THREE.MeshStandardMaterial({ map: this.consoleTex, roughness: 0.25, metalness: 0.1, emissive: '#ffffff', emissiveMap: this.consoleTex, emissiveIntensity: 0.55 }));
    top.rotation.x = -Math.PI / 2;
    top.position.y = 0.201;
    s.add(top);
  }

  private drawConsole(st: TableState) {
    const c = this.consoleCanvas.getContext('2d')!;
    const S = 512;
    const g = c.createLinearGradient(0, 0, S, S);
    g.addColorStop(0, '#2c363d'); g.addColorStop(1, '#0e1316');
    c.fillStyle = g;
    rr(c, 0, 0, S, S, 70); c.fill();
    c.font = '900 64px "Noto Serif SC", serif';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    const pos = [[S / 2, S - 52], [S - 52, S / 2], [S / 2, 52], [52, S / 2]];
    for (let r = 0; r < 4; r++) {
      const on = st.focus === r;
      c.save();
      c.translate(pos[r][0], pos[r][1]);
      c.rotate([0, -Math.PI / 2, Math.PI, Math.PI / 2][r]);
      c.shadowColor = on ? 'rgba(255,170,60,.9)' : 'transparent';
      c.shadowBlur = on ? 24 : 0;
      c.fillStyle = on ? '#ffc35c' : 'rgba(255,184,74,.25)';
      c.fillText(st.winds[r], 0, 4);
      if (st.dealer === r) { c.fillStyle = '#ff4b3a'; c.beginPath(); c.arc(40, -26, 8, 0, Math.PI * 2); c.fill(); }
      c.restore();
    }
    c.fillStyle = '#05080a';
    rr(c, 112, 128, 288, 256, 30); c.fill();
    c.font = '700 100px Orbitron, ui-monospace, monospace';
    c.fillStyle = '#ff5440';
    c.shadowColor = 'rgba(255,84,64,.9)'; c.shadowBlur = 18;
    c.fillText(String(st.wallCount).padStart(3, '0'), S / 2, 222);
    c.shadowBlur = 0;
    const P: Record<number, number[]> = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
    st.dice.forEach((n, i) => {
      const x = S / 2 - 90 + i * 64, y = 290;
      c.fillStyle = '#f7f3e8'; rr(c, x, y, 52, 52, 10); c.fill();
      P[n].forEach((p) => {
        c.fillStyle = n === 1 || n === 4 ? '#c8302a' : '#1c2340';
        c.beginPath(); c.arc(x + 11 + (p % 3) * 15, y + 11 + Math.floor(p / 3) * 15, 5.5, 0, Math.PI * 2); c.fill();
      });
    });
    this.consoleTex.needsUpdate = true;
  }

  /* -------------------------------------------------------------- */
  /* Tiles                                                           */
  /* -------------------------------------------------------------- */

  /**
   * A single material per tile: ivory, orange back below the SPLIT line, and the artwork
   * painted straight onto the top face (so it follows the block, with no plate stuck on).
   */
  private tileMat(kind: string) {
    if (this.faceMats[kind]) return this.faceMats[kind];
    const face = kind === 'back' ? null : this.faces[kind] ?? null;
    const m = new THREE.MeshStandardMaterial({ color: '#f8f2e2', roughness: 0.3, metalness: 0 });
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uBack = { value: new THREE.Color('#ee8a2c') };
      sh.uniforms.uFace = { value: face };
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vLP;\nvarying vec3 vLN;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLP = position; vLN = normal;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
uniform vec3 uBack;
${face ? 'uniform sampler2D uFace;' : ''}
varying vec3 vLP;
varying vec3 vLN;`)
        .replace('#include <color_fragment>', `#include <color_fragment>
{
  float w = fwidth(vLP.y) * 1.2 + 0.0015;
  float ivory = smoothstep(${SPLIT.toFixed(4)} - w, ${SPLIT.toFixed(4)} + w, vLP.y);
  diffuseColor.rgb = mix(uBack, diffuseColor.rgb, ivory);
  float seam = 1.0 - smoothstep(0.0, 0.012, abs(vLP.y - ${SPLIT.toFixed(4)}));
  diffuseColor.rgb *= 1.0 - 0.18 * seam;
  ${face ? `if (vLN.y > 0.5) {
    vec2 fuv = vec2(vLP.x / ${(TW * 0.9).toFixed(4)} + 0.5, 0.5 - vLP.z / ${(TL * 0.92).toFixed(4)});
    if (fuv.x > 0.0 && fuv.x < 1.0 && fuv.y > 0.0 && fuv.y < 1.0) {
      vec4 f = texture2D(uFace, fuv);
      diffuseColor.rgb = mix(diffuseColor.rgb, f.rgb, f.a);
    }
  }` : ''}
}`);
    };
    m.customProgramCacheKey = () => (face ? 'tile-face' : 'tile-back');
    return (this.faceMats[kind] = m);
  }

  private makeTile(key: string, kind: string): TileObj {
    const g = new THREE.Group();
    const body = new THREE.Mesh(this.tileGeo, this.tileMat(kind));
    body.castShadow = true; body.receiveShadow = true;
    g.add(body);
    g.rotation.order = 'YXZ';
    this.scene.add(g);
    const pose: Pose = { pos: new THREE.Vector3(), quat: new THREE.Quaternion(), scale: 1 };
    return { key, kind, group: g, to: pose, t0: 0, dur: 0, arc: 0 };
  }

  private setGlow(o: TileObj, mat: THREE.Material | null) {
    if (o.glow && (!mat || o.glow.material !== mat)) { o.group.remove(o.glow); o.glow = undefined; }
    if (mat && !o.glow) {
      o.glow = new THREE.Mesh(this.glowGeo, mat);
      o.glow.rotation.x = -Math.PI / 2;
      o.glow.position.y = -TT / 2 + 0.004;
      o.glow.renderOrder = -1;
      o.group.add(o.glow);
    }
  }

  /** Small green dot above a tile of your hand. */
  private setMark(o: TileObj, on: boolean) {
    if (on && !o.mark) {
      o.mark = new THREE.Mesh(this.markGeo, this.markMat);
      o.mark.rotation.x = -Math.PI / 2;
      o.mark.position.set(0, TT / 2, -TL / 2 - 0.07);
      o.group.add(o.mark);
    } else if (!on && o.mark) { o.group.remove(o.mark); o.mark = undefined; }
  }

  /** Pose of a laid tile (face up or down) in player r's frame. */
  private laidPose(r: number, x: number, z: number, scale: number, faceDown = false): Pose {
    const p = local(r, x, z);
    const e = new THREE.Euler(0, YAW[r], faceDown ? Math.PI : 0, 'YXZ');
    return { pos: new THREE.Vector3(p.x, (TT * scale) / 2, p.z), quat: new THREE.Quaternion().setFromEuler(e), scale };
  }

  /** Pose of a standing tile, face towards its player. */
  private standPose(r: number, x: number): Pose {
    const p = local(r, x, EDGE_Z);
    const e = new THREE.Euler(Math.PI / 2, YAW[r], 0, 'YXZ');
    return { pos: new THREE.Vector3(p.x, TL / 2, p.z), quat: new THREE.Quaternion().setFromEuler(e), scale: 1 };
  }

  /** Your hand: standing at the edge, tilted towards you so it reads face on. */
  private handPose(x: number, lift: number): Pose {
    const a = Math.PI / 2 - this.elev * 0.72;
    const y = HAND * ((TL / 2) * Math.sin(a) + (TT / 2) * Math.cos(a));
    const e = new THREE.Euler(a, 0, 0, 'YXZ');
    return { pos: new THREE.Vector3(x, y + lift, HAND_Z - lift * 0.3), quat: new THREE.Quaternion().setFromEuler(e), scale: HAND };
  }

  /** Where an appearing tile starts from: its player's hand. */
  private spawnPose(r: number): Pose {
    const p = r === 0 ? new THREE.Vector3(0.6, 1.6, 6.4) : (() => { const q = local(r, 0, EDGE_Z); return new THREE.Vector3(q.x, 0.9, q.z); })();
    const e = new THREE.Euler(r === 0 ? 0.9 : Math.PI / 2, YAW[r], 0, 'YXZ');
    return { pos: p, quat: new THREE.Quaternion().setFromEuler(e), scale: 1 };
  }

  async update(st: TableState) {
    await this.ready;
    this.state = st;
    this.drawConsole(st);
    this.zones.forEach((z, r) => {
      const m = z.material as THREE.MeshBasicMaterial;
      m.color.set(st.focus === r ? '#ffc94a' : '#000000');
      m.opacity = st.focus === r ? 0.18 : 0.12;
    });

    const want: Want[] = [];
    st.seats.forEach((s, r) => {
      s.discards.forEach((k, i) => {
        const x = POOL.x0 + (i % POOL.cols) * POOL.dx, z = POOL.z0 + Math.floor(i / POOL.cols) * POOL.dz;
        const last = st.lastDiscard === r && i === s.discards.length - 1;
        want.push({ key: `d${r}-${i}-${k}`, kind: k, pose: this.laidPose(r, x, z, 1), spawn: r, glow: last ? this.glowMat : undefined });
      });
      if (r === 0) { this.myEdge(s, want); return; }
      // Player's edge: standing (or revealed) hand, melds, flowers in front.
      const mw = TW * MELD + 0.012;
      const handW = s.revealed ? s.revealed.length * mw : s.standing * 0.475 + (s.justDrew ? 0.14 : 0);
      const meldsW = s.melds.reduce((a, m) => a + m.tiles.length * mw + 0.08, 0);
      let x = Math.max(-4.1, -(handW + (s.melds.length ? 0.22 : 0) + meldsW) / 2);
      const start = x;
      if (s.revealed) {
        s.revealed.forEach((k, i) => { want.push({ key: `r${r}-${i}-${k}`, kind: k, pose: this.laidPose(r, x + mw / 2, EDGE_Z, MELD), spawn: r }); x += mw; });
      } else {
        for (let i = 0; i < s.standing; i++) {
          if (s.justDrew && i === s.standing - 1) x += 0.14;
          want.push({ key: `h${r}-${i}`, kind: 'back', pose: this.standPose(r, x + 0.235), spawn: -1 });
          x += 0.475;
        }
      }
      if (s.melds.length) x += 0.22;
      s.melds.forEach((m, mi) => {
        let used = false;
        m.tiles.forEach((k, i) => {
          const taken = !used && !!m.claimed && k === m.claimed && (used = true);
          const down = k === 'back';
          want.push({ key: `m${r}-${mi}-${i}`, kind: down ? 'back' : k, pose: this.laidPose(r, x + mw / 2, EDGE_Z, MELD, down), spawn: r, glow: taken ? this.takenMat : undefined });
          x += mw;
        });
        x += 0.08;
      });
      let fx = start;
      s.flowers.forEach((k, i) => {
        want.push({ key: `f${r}-${i}-${k}`, kind: k, pose: this.laidPose(r, fx + (TW * FLOWER) / 2, EDGE_Z + 0.5, FLOWER), spawn: r });
        fx += TW * FLOWER + 0.01;
      });
    });

    // Reconciliation: keep, move, spawn, remove.
    const now = performance.now();
    const keep = new Set(want.map((w) => w.key));
    const removed: TileObj[] = [];
    for (const [k, o] of this.tiles) if (!keep.has(k)) { removed.push(o); this.tiles.delete(k); }
    for (const w of want) {
      let o = this.tiles.get(w.key);
      if (!o) {
        o = this.makeTile(w.key, w.kind);
        // A tile claimed from the discards starts from where it was.
        // A tile leaving your hand goes to where it is played.
        let ri = removed.findIndex((x) => x.kind === w.kind && x.key.startsWith('d'));
        if (ri < 0) ri = removed.findIndex((x) => x.kind === w.kind && x.key.startsWith('me'));
        const fromHand = w.key.startsWith('me');
        const from = ri >= 0 ? poseOf(removed[ri].group)
          : fromHand ? { ...w.pose, pos: w.pose.pos.clone().add(new THREE.Vector3(0, 0.9, -0.6)) }
          : w.spawn >= 0 ? this.spawnPose(w.spawn) : w.pose;
        if (ri >= 0) { this.scene.remove(removed[ri].group); removed.splice(ri, 1); }
        apply(o.group, from);
        if (w.i !== undefined) o.group.userData.i = w.i;
        o.from = from; o.to = w.pose; o.t0 = now; o.dur = from === w.pose ? 0 : fromHand && ri < 0 ? 300 : 420; o.arc = fromHand ? 0.1 : w.spawn === 0 ? 0.35 : 0.6;
        this.tiles.set(w.key, o);
      } else if (!samePose(o.to, w.pose)) {
        o.from = poseOf(o.group); o.to = w.pose; o.t0 = now; o.dur = 220; o.arc = 0;
      }
      if (w.i !== undefined) o.group.userData.i = w.i;
      this.setGlow(o, w.glow ?? null);
      this.setMark(o, !!w.mark);
    }
    for (const o of removed) this.scene.remove(o.group);
  }

  /** Your edge: standing hand tilted towards you, melds on the right, flowers front left. */
  private myEdge(s: SeatState, want: Want[]) {
    const hand = s.hand ?? [];
    const mw = TW * 0.92 + 0.012;
    const meldsW = s.melds.reduce((a, m) => a + m.tiles.length * mw + 0.1, 0);
    const handW = hand.length * HAND_STEP + (s.justDrew ? 0.2 : 0);
    let x = -(handW + (s.melds.length ? 0.35 : 0) + meldsW) / 2;
    const seen: Record<string, number> = {};
    hand.forEach((k, i) => {
      if (s.justDrew && i === hand.length - 1) x += 0.2;
      const n = (seen[k] = (seen[k] ?? 0) + 1);
      const lift = s.selected === i ? 0.2 : this.hover === i ? 0.07 : 0;
      want.push({ key: `me-${k}-${n}`, kind: k, pose: this.handPose(x + HAND_STEP / 2, lift), spawn: 0, i, mark: !!s.ready?.[i] });
      x += HAND_STEP;
    });
    if (s.melds.length) x += 0.35;
    s.melds.forEach((m, mi) => {
      let used = false;
      m.tiles.forEach((k, i) => {
        const taken = !used && !!m.claimed && k === m.claimed && (used = true);
        const down = k === 'back';
        want.push({ key: `m0-${mi}-${i}`, kind: down ? 'back' : k, pose: this.laidPose(0, x + mw / 2, HAND_Z, 0.92, down), spawn: 0, glow: taken ? this.takenMat : undefined });
        x += mw;
      });
      x += 0.1;
    });
    s.flowers.forEach((k, i) => {
      want.push({ key: `f0-${i}-${k}`, kind: k, pose: this.laidPose(0, -4.35 + i * (TW * 0.6 + 0.01), 3.3, 0.6), spawn: 0 });
    });
  }

  /* -------------------------------------------------------------- */
  /* Camera and rendering                                            */
  /* -------------------------------------------------------------- */

  resize(w: number, h: number) {
    this.width = w; this.height = h;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.frame();
    if (this.state) this.update(this.state); // the hand follows the camera angle
  }

  /** Frames the whole table, your hand included. */
  private frame() {
    const cam = this.camera;
    const el = (this.elev = THREE.MathUtils.degToRad(this.width / this.height > 1.9 ? 48 : 52));
    const dir = new THREE.Vector3(0, Math.sin(el), Math.cos(el));
    const target = new THREE.Vector3(0, 0, 0.2);
    const pts: THREE.Vector3[] = [];
    const E = 5.2;
    for (const x of [-E, E]) for (const z of [-E, E]) pts.push(new THREE.Vector3(x, 0, z));
    pts.push(new THREE.Vector3(-E, 0.62, -EDGE_Z), new THREE.Vector3(E, 0.62, -EDGE_Z));
    cam.clearViewOffset();
    let d = 16;
    let box = { minX: -1, maxX: 1, minY: -1, maxY: 1 };
    for (let i = 0; i < 6; i++) {
      cam.position.copy(target).addScaledVector(dir, d);
      cam.lookAt(target);
      cam.updateMatrixWorld(); cam.updateProjectionMatrix();
      box = { minX: 9, maxX: -9, minY: 9, maxY: -9 };
      for (const p of pts) {
        const q = p.clone().project(cam);
        box.minX = Math.min(box.minX, q.x); box.maxX = Math.max(box.maxX, q.x);
        box.minY = Math.min(box.minY, q.y); box.maxY = Math.max(box.maxY, q.y);
      }
      const span = Math.max((box.maxX - box.minX) / 2, (box.maxY - box.minY) / 2);
      d *= span / 0.985;
    }
    const cx = (box.minX + box.maxX) / 2, cy = (box.minY + box.maxY) / 2;
    cam.setViewOffset(this.width, this.height, (cx * this.width) / 2, (-cy * this.height) / 2, this.width, this.height);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
    this.onFrame?.(this.anchors());
  }

  private screen(x: number, y: number, z: number) {
    const q = new THREE.Vector3(x, y, z).project(this.camera);
    return { x: ((q.x + 1) / 2) * this.width, y: ((1 - q.y) / 2) * this.height };
  }

  anchors(): Anchors {
    const a = Math.PI / 2 - this.elev * 0.72;
    const top = this.screen(0, HAND * (TL * Math.sin(a) + TT * Math.cos(a)) + 0.02, HAND_Z - HAND * (TL / 2) * Math.cos(a));
    return {
      plate: [this.screen(-5.25, 0, 4.6), this.screen(6.5, 0, 0), this.screen(4.85, 0.3, -5.5), this.screen(-6.5, 0, 0)],
      banner: [0, 1, 2, 3].map((r) => { const p = local(r, 0.99, 2.22); return this.screen(p.x, 0.4, p.z); }),
      center: this.screen(0, 0.3, 0),
      handTop: top.y,
    };
  }

  private loop(t: number) {
    this.raf = requestAnimationFrame(this.loop);
    for (const o of this.tiles.values()) {
      if (!o.from || !o.dur) { if (o.from) { apply(o.group, o.to); o.from = undefined; } continue; }
      const k = Math.min(1, (t - o.t0) / o.dur);
      const e = ease(k);
      o.group.position.lerpVectors(o.from.pos, o.to.pos, e);
      o.group.position.y += Math.sin(Math.PI * k) * o.arc;
      o.group.quaternion.slerpQuaternions(o.from.quat, o.to.quat, e);
      o.group.scale.setScalar(o.from.scale + (o.to.scale - o.from.scale) * e);
      if (k >= 1) { apply(o.group, o.to); o.from = undefined; }
    }
    this.glowMat.opacity = 0.55 + 0.4 * Math.sin(t / 260);
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.canvas.removeEventListener('pointermove', this.onMove);
    this.canvas.removeEventListener('pointerleave', this.onLeave);
    this.canvas.removeEventListener('pointerdown', this.onDown);
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}

/* ---------------------------------------------------------------- */

function local(r: number, x: number, z: number) {
  const c = Math.cos(YAW[r]), s = Math.sin(YAW[r]);
  return { x: x * c + z * s, z: -x * s + z * c };
}
function poseOf(g: THREE.Object3D): Pose { return { pos: g.position.clone(), quat: g.quaternion.clone(), scale: g.scale.x }; }
function apply(g: THREE.Object3D, p: Pose) { g.position.copy(p.pos); g.quaternion.copy(p.quat); g.scale.setScalar(p.scale); }
function samePose(a: Pose, b: Pose) { return a.pos.distanceToSquared(b.pos) < 1e-6 && Math.abs(a.quat.dot(b.quat)) > 0.99999 && a.scale === b.scale; }

function roundedRect(w: number, h: number, r: number) {
  const s = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}
/** ShapeGeometry UVs are in world coordinates: bring them back to 0..1. */
function fixUv(g: THREE.BufferGeometry, size: number) {
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / size + 0.5, uv.getY(i) / size + 0.5);
  uv.needsUpdate = true;
}
function rr(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath();
  c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}
