/**
 * UI margins around the 3D table.
 *
 * The table itself is framed by the camera (src/three/scene.ts); here we only compute the usable
 * screen area (outside the notch) and the scale of buttons and the top bar on large screens.
 */
export interface Insets { top: number; right: number; bottom: number; left: number }

export interface Layout {
  W: number; H: number;
  L: number; R: number; T: number; B: number;
  k: number;          // scale of UI elements (top bar, buttons) on large screens
}

export function computeLayout(W: number, H: number, ins: Insets): Layout {
  const L = ins.left + 8, R = W - ins.right - 8, T = ins.top + 6, B = H - ins.bottom - 6;
  const k = Math.max(1, Math.min((R - L) / 1050, (B - T) / 620, 1.6));
  return { W, H, L, R, T, B, k };
}
