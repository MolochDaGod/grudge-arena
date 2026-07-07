/**
 * Terrain-aware locomotion feedback — uses anim-bank clips for landings, slopes, turns.
 */

const LAND_DROP_MIN = 0.28;
const LAND_COOLDOWN = 0.85;
const SLOPE_SAMPLE = 1.35;
const UPHILL_GRADE = 0.14;
const DOWNHILL_GRADE = -0.1;

export class TerrainLocoFeedback {
  /**
   * @param {THREE.Object3D} mesh
   * @param {import('./GroundSampler.js').GroundSampler | null} groundSampler
   * @param {{ playOnce?: (s: string, sp?: number) => boolean, play?: (s: string, o?: object) => boolean } | null} animCtrl
   */
  constructor(mesh, groundSampler, animCtrl) {
    this.mesh = mesh;
    this.groundSampler = groundSampler;
    this.animCtrl = animCtrl;
    this._preSnapY = mesh.position.y;
    this._cooldown = 0;
    this._steepTurnCooldown = 0;
  }

  /** Call before GroundSampler.snapMesh. */
  beforeGroundSnap() {
    this._preSnapY = this.mesh.position.y;
  }

  /**
   * Call after ground snap + movement for the frame.
   * @param {number} dt
   * @param {{ moving?: boolean, worldDirX?: number, worldDirZ?: number, turnRate?: number }} ctx
   */
  afterMove(dt, ctx = {}) {
    this._cooldown = Math.max(0, this._cooldown - dt);
    this._steepTurnCooldown = Math.max(0, this._steepTurnCooldown - dt);

    const postY = this.mesh.position.y;
    const drop = this._preSnapY - postY;

    if (
      this._cooldown <= 0 &&
      drop >= LAND_DROP_MIN &&
      ctx.moving &&
      this.animCtrl?.playOnce
    ) {
      if (this.animCtrl.playOnce("landHard", 1.05)) {
        this._cooldown = LAND_COOLDOWN;
      } else if (this.animCtrl.playOnce("jumpLand", 1)) {
        this._cooldown = LAND_COOLDOWN;
      }
    }

    const turnRate = Math.abs(ctx.turnRate ?? 0);
    if (
      ctx.moving &&
      turnRate > 4.5 &&
      this._steepTurnCooldown <= 0 &&
      this.animCtrl?.playOnce
    ) {
      const turnState = (ctx.turnRate ?? 0) > 0 ? "turnRight" : "turnLeft";
      if (this.animCtrl.playOnce(turnState, 1.15)) {
        this._steepTurnCooldown = 0.45;
      }
    }
  }

  /**
   * Speed multiplier from terrain grade ahead (uphill slower, downhill slightly faster).
   * @param {number} worldDirX
   * @param {number} worldDirZ
   */
  slopeSpeedMultiplier(worldDirX, worldDirZ) {
    if (!this.groundSampler) return 1;
    const len = Math.hypot(worldDirX, worldDirZ);
    if (len < 0.01) return 1;

    const x = this.mesh.position.x;
    const z = this.mesh.position.z;
    const y0 = this.groundSampler.sampleY(x, z, this.mesh.position.y);
    const y1 = this.groundSampler.sampleY(
      x + (worldDirX / len) * SLOPE_SAMPLE,
      z + (worldDirZ / len) * SLOPE_SAMPLE,
      y0,
    );
    const grade = (y1 - y0) / SLOPE_SAMPLE;
    if (grade >= UPHILL_GRADE) return 0.7 + Math.max(0, 0.2 - grade);
    if (grade <= DOWNHILL_GRADE) return 1.08;
    return 1;
  }

  /**
   * Optional overlay when descending a noticeable grade at speed.
   */
  maybeDescendOverlay(moving, speed01, worldDirX, worldDirZ) {
    if (!moving || speed01 < 0.35 || !this.animCtrl?.play) return;
    const mult = this.slopeSpeedMultiplier(worldDirX, worldDirZ);
    if (mult > 1.02 && this._cooldown <= 0) {
      this.animCtrl.play("descendSlope", { loop: false, fadeDuration: 0.18, speed: 1.1 });
    }
  }
}