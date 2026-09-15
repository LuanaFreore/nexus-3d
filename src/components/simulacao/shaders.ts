/**
 * GLSL sources for the GPU N-body engine + particle renderer (simulacao.md).
 * Compute runs via GPUComputationRenderer-style texture feedback:
 *   texturePosition = xyz pos + raw mass (w)
 *   textureVelocity = xyz vel + unused (w)
 * Loop bounds are baked in as literals (ESSL1.00-safe).
 */

export function velocityComputeShader(texSize: number): string {
  return /* glsl */ `
uniform float uDt;
uniform float uG;
uniform float uSoft;
uniform float uDamp;
uniform float uMassScale;
uniform vec3 uWellPos;
uniform float uWellMass; // signed (negative = repel), pre-scaled

void main() {
  vec2 uv = gl_FragCoord.xy / resolution.xy;
  vec4 self = texture2D( texturePosition, uv );
  vec3 pos = self.xyz;
  vec3 vel = texture2D( textureVelocity, uv ).xyz;

  float soft2 = uSoft * uSoft;
  vec3 acc = vec3( 0.0 );

  for ( float y = 0.0; y < ${texSize}.0; y += 1.0 ) {
    for ( float x = 0.0; x < ${texSize}.0; x += 1.0 ) {
      vec2 uv2 = ( vec2( x, y ) + 0.5 ) / resolution.xy;
      vec4 other = texture2D( texturePosition, uv2 );
      vec3 d = other.xyz - pos;
      float dist2 = dot( d, d ) + soft2;
      float inv = inversesqrt( dist2 );
      acc += other.w * d * ( inv * inv * inv );
    }
  }
  acc *= uG * uMassScale;

  // cursor gravity well (attract / repel)
  vec3 dw = uWellPos - pos;
  float dw2 = dot( dw, dw ) + soft2 * 4.0;
  float invw = inversesqrt( dw2 );
  acc += uWellMass * dw * ( invw * invw * invw );

  vec3 newVel = ( vel + acc * uDt ) * uDamp;
  gl_FragColor = vec4( newVel, 1.0 );
}
`;
}

export const POSITION_COMPUTE_SHADER = /* glsl */ `
uniform float uDt;

void main() {
  vec2 uv = gl_FragCoord.xy / resolution.xy;
  vec4 pos = texture2D( texturePosition, uv );
  vec3 vel = texture2D( textureVelocity, uv ).xyz;
  gl_FragColor = vec4( pos.xyz + vel * uDt, pos.w );
}
`;

/**
 * Decimation shader: writes a 32×32 grid of evenly strided texels from a
 * large state texture, so telemetry (energy / COM) can be read back cheaply.
 */
export function decimateShader(inputRes: number): string {
  return /* glsl */ `
uniform sampler2D uTex;
uniform float uStride; // input texels between samples

void main() {
  vec2 oc = floor( gl_FragCoord.xy );
  float outIdx = oc.y * 32.0 + oc.x;
  float inIdx = outIdx * uStride;
  vec2 ic = vec2( mod( inIdx, ${inputRes}.0 ), floor( inIdx / ${inputRes}.0 ) );
  vec2 uv = ( ic + 0.5 ) / ${inputRes}.0;
  gl_FragColor = texture2D( uTex, uv );
}
`;
}

/**
 * Particle renderer: THREE.Points, procedural circular sprite (alpha
 * discard), gl_PointSize scaled by perspective + mass, mass color ramp
 * #F6287D → #FFFFFF, exponential distance fade toward the void.
 * Define CPU_MODE to read position/mass from attributes instead of a texture.
 */
export const POINTS_VERTEX_SHADER = /* glsl */ `
#ifdef CPU_MODE
attribute float aMass;
#else
attribute vec2 reference;
uniform sampler2D uPosTex;
#endif

uniform float uPointScale;
uniform float uMassMin;
uniform float uMassMax;
uniform float uBirth; // 0→1 spawn burst (render-only)

varying float vMassNorm;
varying float vViewZ;

void main() {
  #ifdef CPU_MODE
  vec3 pos = position;
  float mass = aMass;
  #else
  vec4 posMass = texture2D( uPosTex, reference );
  vec3 pos = posMass.xyz;
  float mass = posMass.w;
  #endif

  float e = 1.0 - pow( 1.0 - uBirth, 3.0 );
  pos *= mix( 0.02, 1.0, e );

  vec4 mv = modelViewMatrix * vec4( pos, 1.0 );
  gl_Position = projectionMatrix * mv;

  float massNorm = clamp( ( mass - uMassMin ) / max( uMassMax - uMassMin, 1e-6 ), 0.0, 1.0 );
  vMassNorm = massNorm;
  vViewZ = -mv.z;
  gl_PointSize = clamp( uPointScale * ( 0.7 + 2.1 * massNorm ) / max( -mv.z, 0.1 ), 1.0, 42.0 );
}
`;

export const POINTS_FRAGMENT_SHADER = /* glsl */ `
uniform vec3 uColorA; // #F6287D (light)
uniform vec3 uColorB; // #FFFFFF (heavy)
uniform vec3 uFogColor;
uniform float uFogDensity;

varying float vMassNorm;
varying float vViewZ;

void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length( c );
  if ( d > 0.5 ) discard;

  float alpha = 1.0 - smoothstep( 0.08, 0.5, d );
  vec3 col = mix( uColorA, uColorB, vMassNorm );
  // hot core on heavy particles (feeds the bloom pass)
  col += ( 1.0 - smoothstep( 0.0, 0.16, d ) ) * ( 0.35 + 0.85 * vMassNorm );

  float f = 1.0 - exp( - uFogDensity * uFogDensity * vViewZ * vViewZ );
  col = mix( col, uFogColor, f );
  gl_FragColor = vec4( col, alpha * ( 1.0 - f ) );
}
`;
