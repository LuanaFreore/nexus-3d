import * as THREE from 'three';
import { GPUComputationRenderer } from 'three/examples/jsm/misc/GPUComputationRenderer.js';
import type { Variable } from 'three/examples/jsm/misc/GPUComputationRenderer.js';
import type { DynamicParams, EngineMode } from './types';
import type { InitialState } from './initialConditions';
import { TARGET_TOTAL_MASS, totalRawMass } from './initialConditions';
import {
  velocityComputeShader,
  POSITION_COMPUTE_SHADER,
  decimateShader,
} from './shaders';
import { computeEnergyAndCom } from './engine';
import type { KernelSubset, NBodyEngine } from './engine';

const TELEMETRY_GRID = 32; // 32×32 = 1024 strided samples

/** EXT_disjoint_timer_query_webgl2 (not in this TS DOM lib). */
interface DisjointTimerQueryWebGL2 {
  readonly TIME_ELAPSED_EXT: number;
  readonly GPU_DISJOINT_EXT: number;
}

/**
 * GpuEngine — O(n²) N-body on the GPU via texture feedback
 * (GPUComputationRenderer-style compute in shaders, simulacao.md).
 * Positions (xyz + raw mass in w) and velocities live in float RGBA
 * textures; the velocity pass sums all pair interactions with softening.
 */
export class GpuEngine implements NBodyEngine {
  readonly mode: EngineMode = 'gpu';
  readonly count: number;
  readonly texSize: number;
  readonly massScale: number;
  readonly massMin: number;
  readonly massMax: number;
  lastStepMs = 0;

  private renderer: THREE.WebGLRenderer;
  private gl: WebGL2RenderingContext;
  private gpu: GPUComputationRenderer;
  private posVar: Variable;
  private velVar: Variable;
  private dynamic: DynamicParams;
  private well = { x: 0, y: 0, z: 0, mass: 0 };

  // decimation pass for cheap telemetry readback
  private decimatePos: THREE.ShaderMaterial;
  private decimateVel: THREE.ShaderMaterial;
  private rtPos: THREE.WebGLRenderTarget;
  private rtVel: THREE.WebGLRenderTarget;
  private readBuffer: Float32Array;
  private floatReadable: boolean;
  private massesCopy: Float32Array;

  // EXT_disjoint_timer_query_webgl2 step timing
  private timerExt: DisjointTimerQueryWebGL2 | null = null;
  private queryQueue: WebGLQuery[] = [];
  private activeQuery: WebGLQuery | null = null;

  constructor(renderer: THREE.WebGLRenderer, state: InitialState, dynamic: DynamicParams) {
    this.renderer = renderer;
    this.gl = renderer.getContext() as WebGL2RenderingContext;
    this.dynamic = { ...dynamic };
    this.count = state.masses.length;
    this.texSize = Math.sqrt(this.count);
    this.massMin = state.massMin;
    this.massMax = state.massMax;
    this.massScale = TARGET_TOTAL_MASS / totalRawMass(state.masses);
    this.massesCopy = state.masses.slice();

    const gpu = new GPUComputationRenderer(this.texSize, this.texSize, renderer);
    this.gpu = gpu;

    const posTex = gpu.createTexture();
    const velTex = gpu.createTexture();
    const pd = posTex.image.data as Float32Array;
    const vd = velTex.image.data as Float32Array;
    for (let i = 0; i < this.count; i++) {
      pd[i * 4] = state.positions[i * 3];
      pd[i * 4 + 1] = state.positions[i * 3 + 1];
      pd[i * 4 + 2] = state.positions[i * 3 + 2];
      pd[i * 4 + 3] = state.masses[i];
      vd[i * 4] = state.velocities[i * 3];
      vd[i * 4 + 1] = state.velocities[i * 3 + 1];
      vd[i * 4 + 2] = state.velocities[i * 3 + 2];
      vd[i * 4 + 3] = 1;
    }

    this.velVar = gpu.addVariable('textureVelocity', velocityComputeShader(this.texSize), velTex);
    this.posVar = gpu.addVariable('texturePosition', POSITION_COMPUTE_SHADER, posTex);
    gpu.setVariableDependencies(this.velVar, [this.velVar, this.posVar]);
    gpu.setVariableDependencies(this.posVar, [this.velVar, this.posVar]);

    const vu = this.velVar.material.uniforms;
    vu.uDt = { value: 0 };
    vu.uG = { value: this.dynamic.gravity };
    vu.uSoft = { value: this.dynamic.softening };
    vu.uDamp = { value: this.dynamic.damping };
    vu.uMassScale = { value: this.massScale };
    vu.uWellPos = { value: new THREE.Vector3() };
    vu.uWellMass = { value: 0 };
    this.posVar.material.uniforms.uDt = { value: 0 };

    const error = gpu.init();
    if (error !== null) {
      throw new Error(`GPUComputationRenderer init failed: ${error}`);
    }

    // decimation pass (strided subsample → tiny readback)
    const stride = this.count / (TELEMETRY_GRID * TELEMETRY_GRID);
    this.decimatePos = gpu.createShaderMaterial(decimateShader(this.texSize), {
      uTex: { value: null },
      uStride: { value: stride },
    });
    this.decimateVel = gpu.createShaderMaterial(decimateShader(this.texSize), {
      uTex: { value: null },
      uStride: { value: stride },
    });
    this.rtPos = gpu.createRenderTarget(
      TELEMETRY_GRID,
      TELEMETRY_GRID,
      THREE.ClampToEdgeWrapping,
      THREE.ClampToEdgeWrapping,
      THREE.NearestFilter,
      THREE.NearestFilter,
    );
    this.rtVel = gpu.createRenderTarget(
      TELEMETRY_GRID,
      TELEMETRY_GRID,
      THREE.ClampToEdgeWrapping,
      THREE.ClampToEdgeWrapping,
      THREE.NearestFilter,
      THREE.NearestFilter,
    );
    this.readBuffer = new Float32Array(TELEMETRY_GRID * TELEMETRY_GRID * 4);
    this.floatReadable =
      this.gl.getParameter(this.gl.IMPLEMENTATION_COLOR_READ_TYPE) === this.gl.FLOAT;

    this.timerExt = this.gl.getExtension(
      'EXT_disjoint_timer_query_webgl2',
    ) as DisjointTimerQueryWebGL2 | null;
  }

  setDynamic(p: DynamicParams): void {
    this.dynamic = { ...p };
  }

  setWell(x: number, y: number, z: number, signedMass: number): void {
    this.well = { x, y, z, mass: signedMass };
  }

  getPositionTexture(): THREE.Texture {
    return this.gpu.getCurrentRenderTarget(this.posVar).texture;
  }

  getMasses(): Float32Array {
    return this.massesCopy;
  }

  private beginTimer(): void {
    if (!this.timerExt || this.activeQuery || this.queryQueue.length > 8) return;
    const q = this.gl.createQuery();
    if (!q) return;
    this.gl.beginQuery(this.timerExt.TIME_ELAPSED_EXT, q);
    this.activeQuery = q;
  }

  private endTimer(): void {
    if (!this.timerExt || !this.activeQuery) return;
    this.gl.endQuery(this.timerExt.TIME_ELAPSED_EXT);
    this.queryQueue.push(this.activeQuery);
    this.activeQuery = null;
  }

  private pollTimer(): void {
    if (!this.timerExt) return;
    if (this.gl.getParameter(this.timerExt.GPU_DISJOINT_EXT)) {
      for (const q of this.queryQueue) this.gl.deleteQuery(q);
      this.queryQueue.length = 0;
      return;
    }
    while (this.queryQueue.length > 0) {
      const q = this.queryQueue[0];
      if (!this.gl.getQueryParameter(q, this.gl.QUERY_RESULT_AVAILABLE)) break;
      const ns = this.gl.getQueryParameter(q, this.gl.QUERY_RESULT) as number;
      this.lastStepMs = ns / 1e6;
      this.gl.deleteQuery(q);
      this.queryQueue.shift();
    }
  }

  step(dt: number): void {
    const vu = this.velVar.material.uniforms;
    vu.uDt.value = dt;
    vu.uG.value = this.dynamic.gravity;
    vu.uSoft.value = this.dynamic.softening;
    vu.uDamp.value = this.dynamic.damping;
    (vu.uWellPos.value as THREE.Vector3).set(this.well.x, this.well.y, this.well.z);
    // well mass normalized to system mass: 100 ≈ 2× total system mass
    vu.uWellMass.value = this.well.mass * this.massScale * this.count * 0.02;
    this.posVar.material.uniforms.uDt.value = dt;

    const t0 = performance.now();
    this.beginTimer();
    this.gpu.compute();
    this.endTimer();
    this.pollTimer();
    if (!this.timerExt) {
      // fallback: CPU submit time of the compute passes
      this.lastStepMs = performance.now() - t0;
    }
  }

  private readTarget(rt: THREE.WebGLRenderTarget): boolean {
    if (!this.floatReadable) return false;
    try {
      this.renderer.readRenderTargetPixels(
        rt,
        0,
        0,
        TELEMETRY_GRID,
        TELEMETRY_GRID,
        this.readBuffer,
      );
      return true;
    } catch {
      return false;
    }
  }

  sampleTelemetry(): { energy: number; com: [number, number, number] } | null {
    this.decimatePos.uniforms.uTex.value = this.gpu.getCurrentRenderTarget(this.posVar).texture;
    this.decimateVel.uniforms.uTex.value = this.gpu.getCurrentRenderTarget(this.velVar).texture;
    this.gpu.doRenderTarget(this.decimatePos, this.rtPos);
    this.gpu.doRenderTarget(this.decimateVel, this.rtVel);

    const n = TELEMETRY_GRID * TELEMETRY_GRID;
    const positions = new Float32Array(n * 3);
    const velocities = new Float32Array(n * 3);
    const masses = new Float32Array(n);

    if (!this.readTarget(this.rtPos)) return null;
    const buf = this.readBuffer;
    for (let i = 0; i < n; i++) {
      positions[i * 3] = buf[i * 4];
      positions[i * 3 + 1] = buf[i * 4 + 1];
      positions[i * 3 + 2] = buf[i * 4 + 2];
      masses[i] = buf[i * 4 + 3];
    }
    if (!this.readTarget(this.rtVel)) return null;
    for (let i = 0; i < n; i++) {
      velocities[i * 3] = buf[i * 4];
      velocities[i * 3 + 1] = buf[i * 4 + 1];
      velocities[i * 3 + 2] = buf[i * 4 + 2];
    }

    return computeEnergyAndCom(
      positions,
      velocities,
      masses,
      this.dynamic.gravity,
      this.dynamic.softening,
      this.massScale,
    );
  }

  extractSubset(n: number): KernelSubset | null {
    const side = Math.sqrt(n);
    if (!Number.isInteger(side) || side > this.texSize || !this.floatReadable) return null;
    const posBuf = new Float32Array(n * 4);
    const velBuf = new Float32Array(n * 4);
    try {
      this.renderer.readRenderTargetPixels(
        this.gpu.getCurrentRenderTarget(this.posVar),
        0,
        0,
        side,
        side,
        posBuf,
      );
      this.renderer.readRenderTargetPixels(
        this.gpu.getCurrentRenderTarget(this.velVar),
        0,
        0,
        side,
        side,
        velBuf,
      );
    } catch {
      return null;
    }
    const positions = new Float32Array(n * 3);
    const velocities = new Float32Array(n * 3);
    const masses = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      positions[i * 3] = posBuf[i * 4];
      positions[i * 3 + 1] = posBuf[i * 4 + 1];
      positions[i * 3 + 2] = posBuf[i * 4 + 2];
      masses[i] = posBuf[i * 4 + 3];
      velocities[i * 3] = velBuf[i * 4];
      velocities[i * 3 + 1] = velBuf[i * 4 + 1];
      velocities[i * 3 + 2] = velBuf[i * 4 + 2];
    }
    return { positions, velocities, masses };
  }

  dispose(): void {
    for (const q of this.queryQueue) this.gl.deleteQuery(q);
    this.queryQueue.length = 0;
    if (this.activeQuery) {
      this.gl.deleteQuery(this.activeQuery);
      this.activeQuery = null;
    }
    this.rtPos.dispose();
    this.rtVel.dispose();
    this.decimatePos.dispose();
    this.decimateVel.dispose();
    this.gpu.dispose();
  }
}
