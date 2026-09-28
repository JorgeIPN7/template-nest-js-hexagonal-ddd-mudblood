import { createHash } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';

/**
 * Una línea nuestra delante del bundle de Scalar, para que el Zod 4 que trae empaquetado (4.4.3
 * en Scalar 1.72.1) no intente evaluar código.
 *
 * Al cargar, ese Zod prueba `Function('')` para decidir si puede compilar el parser rápido de
 * `z.object`. Nuestra CSP no tiene `'unsafe-eval'` —ni debe tenerlo—, así que Chrome lo bloquea y,
 * aunque Zod capture el error y siga por el camino interpretado sin que nada falle, lo anota en
 * CADA carga en el panel Issues («Content Security Policy of your site blocks the use of `eval` in
 * JavaScript»; `kEvalViolation` en CDP). Ese ruido podía tapar violaciones reales: Issues agrupa
 * por tipo, y un eval nuevo de un bump futuro solo habría subido el contador de una entrada que ya
 * estaba ahí. Con esta línea la documentación carga con **cero** violaciones, y cualquiera es señal.
 *
 * `jitless` es el interruptor que Zod documenta para entornos que no permiten `eval` —su README
 * cita las CSP—, pero se activa con `z.config()`, que desde fuera del bundle no se puede llamar.
 * Zod guarda esa configuración en `globalThis.__zod_globalConfig`, la crea solo si no existe, y su
 * propio código explica que rellenarla antes de que cargue surte efecto (JSDoc de
 * `src/v4/core/core.ts` en el zod 4.6.5 del repo; en el 4.4.3 empaquetado se comprobó el
 * comportamiento, no el comentario). Con `jitless`, la sonda no llega a ejecutarse. No cabe un
 * `<script>` inline antes del bundle —el HTML lo genera `apiReference()` sin ese hueco—, así que
 * va antepuesto al archivo que servimos.
 *
 * El `;` final es obligatorio: el bundle empieza por `(`, y sin él `true(function(){…})()` lanza un
 * `TypeError` y la documentación carga en blanco. El salto de línea final falta a propósito: así el
 * bundle publicado conserva la numeración de líneas del original de `node_modules` —una violación
 * que DevTools sitúe en la línea N del servido está en la línea N del original— y solo se desplazan
 * las columnas de la primera. `??=` no añade requisitos: el bundle lo usa decenas de veces.
 *
 * Si el Zod que empaqueta Scalar cambia el mecanismo, esta línea deja de hacer nada y la violación
 * reaparece; si Scalar deja de traer Zod, sobra. En los dos casos el gate de
 * `scalar-bundle.spec.ts` sobre el bundle instalado se pone en rojo.
 */
export const ZOD_JITLESS_PRELUDE = '(globalThis.__zod_globalConfig ??= {}).jitless = true;';

/**
 * Publica el bundle de Scalar en `outDir`, con `ZOD_JITLESS_PRELUDE` delante: hasheado por
 * contenido, precomprimido y con el manifiesto que lee el runtime. El hash, las versiones
 * comprimidas y los bytes del manifiesto se calculan sobre lo que se sirve, prelude incluido.
 *
 * Vive aparte de `copy-scalar-asset.mjs` para poder testearlo: aquel script tiene efectos al
 * importarse (lee `node_modules` y reescribe `public/`), este módulo solo exporta. Lo ejercita
 * `src/__tests__/scalar-bundle.spec.ts` con un bundle falso y un directorio temporal.
 */
export function publishScalarBundle({ vendorBundle, version, outDir }) {
  const bundle = Buffer.concat([Buffer.from(ZOD_JITLESS_PRELUDE), vendorBundle]);

  const hash = createHash('sha256').update(bundle).digest('hex').slice(0, 12);
  const fileName = `scalar.${hash}.js`;

  // Se limpia el directorio entero: el nombre lleva hash, así que sin esto cada actualización
  // dejaría el bundle anterior acumulándose y servible.
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  writeFileSync(join(outDir, fileName), bundle);
  writeFileSync(join(outDir, `${fileName}.gz`), gzipSync(bundle, { level: 9 }));
  writeFileSync(
    join(outDir, `${fileName}.br`),
    brotliCompressSync(bundle, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }),
  );

  // El runtime lee este manifiesto para saber qué nombre servir. Sin él tendría que escanear el
  // directorio, que es más frágil y no distingue restos de una build anterior.
  const asset = { fileName, version, bytes: bundle.byteLength };
  writeFileSync(join(outDir, 'scalar-asset.json'), `${JSON.stringify(asset, null, 2)}\n`);

  return asset;
}
