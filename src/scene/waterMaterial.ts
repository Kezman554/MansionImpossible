// A cheap stylised water shader for the fish tank: unlit, a tint that darkens with depth, a
// brighter rim where the glass is seen edge-on, and (on High quality only) moving caustic
// light bands. One draw call, no textures; the caustics are compiled out below High.
import { Color, FrontSide, ShaderMaterial } from 'three'
import { resolveMaterial, TANK_MATERIALS } from '../editor/catalog/materials'

const vertexShader = /* glsl */ `
  varying vec3 vWorld;
  varying vec3 vNormal;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`

const fragmentShader = /* glsl */ `
  uniform vec3 uTint;
  uniform vec3 uDeep;
  uniform float uTop;
  uniform float uBottom;
  uniform float uTime;
  varying vec3 vWorld;
  varying vec3 vNormal;

  void main() {
    vec3 n = normalize(vNormal);
    vec3 view = normalize(cameraPosition - vWorld);
    float rim = pow(1.0 - abs(dot(view, n)), 3.0);
    // 0 at the surface, 1 at the bottom of the tank (darker, more opaque further down).
    float depth = clamp((uTop - vWorld.y) / max(uTop - uBottom, 0.001), 0.0, 1.0);
    float surface = step(0.9, n.y);
    vec3 colour = mix(uTint, uDeep, depth * 0.75);
    colour = mix(colour, uTint * 1.2, surface * 0.4);

    #ifdef CAUSTICS
      // Two crossing wavy sine fields; their bright crests read as dancing light on the glass.
      vec2 p = (abs(n.y) > 0.5 ? vWorld.xz : vec2(vWorld.x + vWorld.z, vWorld.y)) * 1.4;
      float a = sin(p.x * 2.1 + uTime * 1.1 + sin(p.y * 1.7 + uTime * 0.8));
      float b = sin(p.y * 2.3 - uTime * 0.9 + sin(p.x * 1.3 - uTime * 0.6));
      float caustic = smoothstep(0.55, 1.0, abs(a * b));
      colour += uTint * caustic * 0.7 * (1.0 - depth * 0.7);
    #endif

    colour += rim * 0.2;
    gl_FragColor = vec4(colour, clamp(0.38 + depth * 0.3 + rim * 0.3 + surface * 0.1, 0.0, 0.85));
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

export interface WaterMaterial extends ShaderMaterial {
  uniforms: {
    uTint: { value: Color }
    uDeep: { value: Color }
    uTop: { value: number }
    uBottom: { value: number }
    uTime: { value: number }
  }
}

/**
 * Water for the tank, tinted with the catalogue's tank water (the same colour as the UI water
 * token: DESIGN.md's one deliberate crossover).
 */
export function createWaterMaterial(caustics: boolean): WaterMaterial {
  const tint = new Color(resolveMaterial(TANK_MATERIALS.water)!.color)
  return new ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uTint: { value: tint },
      uDeep: { value: tint.clone().multiplyScalar(0.18) },
      uTop: { value: 0 },
      uBottom: { value: 0 },
      uTime: { value: 0 },
    },
    defines: caustics ? { CAUSTICS: '' } : {},
    transparent: true,
    depthWrite: false,
    side: FrontSide,
  }) as WaterMaterial
}
