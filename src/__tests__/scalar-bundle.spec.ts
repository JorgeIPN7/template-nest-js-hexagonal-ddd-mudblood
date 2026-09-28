import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createContext, runInContext, type Context } from 'node:vm';
import { brotliDecompressSync, gunzipSync } from 'node:zlib';

import { publishScalarBundle, ZOD_JITLESS_PRELUDE } from '../../scripts/scalar-bundle.mjs';

/**
 * `scripts/scalar-bundle.mjs` decide qué JavaScript sirve la documentación: el nombre con hash,
 * las versiones precomprimidas y el manifiesto que lee `openapi.ts`. Se ejercita con un bundle
 * falso y un directorio temporal —el real pesa 4 MB y brotli a calidad 11 tarda segundos—.
 */
describe('scripts/scalar-bundle.mjs', () => {
  // Empieza por `(`, como el bundle real: es la forma en que un prelude sin `;` final se come la
  // primera expresión (`…true(function(){…})()` → TypeError) y la documentación carga en blanco.
  // Si se cambia por otra cosa, el caso que ejecuta lo publicado deja de detectarlo.
  const VENDOR_BUNDLE = Buffer.from(
    '(function(){window.Scalar={}})();\nconsole.log(2);\n//# sourceMappingURL=standalone.js.map\n',
  );
  let outDir: string;

  beforeEach(() => {
    outDir = join(mkdtempSync(join(tmpdir(), 'scalar-bundle-')), 'public');
  });

  afterEach(() => {
    rmSync(join(outDir, '..'), { recursive: true, force: true });
  });

  describe('publishScalarBundle', () => {
    it('debería nombrar el archivo con los 12 primeros hex del sha256 del contenido publicado', () => {
      // Arrange
      const options = { vendorBundle: VENDOR_BUNDLE, version: '9.9.9', outDir };

      // Act
      const { fileName } = publishScalarBundle(options);

      // Assert
      const published = readFileSync(join(outDir, fileName));
      expect(fileName).toBe(`scalar.${sha256(published).slice(0, 12)}.js`);
    });

    it('debería escribir .gz y .br que se descomprimen exactamente al contenido publicado', () => {
      // Arrange
      const options = { vendorBundle: VENDOR_BUNDLE, version: '9.9.9', outDir };

      // Act
      const { fileName } = publishScalarBundle(options);

      // Assert
      const published = readFileSync(join(outDir, fileName));
      expect(gunzipSync(readFileSync(join(outDir, `${fileName}.gz`)))).toEqual(published);
      expect(brotliDecompressSync(readFileSync(join(outDir, `${fileName}.br`)))).toEqual(published);
    });

    it('debería escribir el manifiesto con el nombre, la versión y los bytes publicados, y devolverlo', () => {
      // Arrange
      const options = { vendorBundle: VENDOR_BUNDLE, version: '9.9.9', outDir };

      // Act
      const asset = publishScalarBundle(options);

      // Assert
      const published = readFileSync(join(outDir, asset.fileName));
      const manifest: unknown = JSON.parse(
        readFileSync(join(outDir, 'scalar-asset.json'), 'utf-8'),
      );
      expect(manifest).toEqual({
        fileName: asset.fileName,
        version: '9.9.9',
        bytes: published.byteLength,
      });
      expect(asset).toEqual(manifest);
    });

    it('debería vaciar el directorio de salida antes de publicar, para no dejar servible un bundle anterior', () => {
      // Arrange
      mkdirSync(outDir, { recursive: true });
      writeFileSync(join(outDir, 'scalar.000000000000.js'), 'bundle viejo');

      // Act
      publishScalarBundle({ vendorBundle: VENDOR_BUNDLE, version: '9.9.9', outDir });

      // Assert
      expect(existsSync(join(outDir, 'scalar.000000000000.js'))).toBe(false);
    });

    it('debería publicar el prelude de Zod delante y el bundle original intacto detrás', () => {
      // Arrange
      const options = { vendorBundle: VENDOR_BUNDLE, version: '9.9.9', outDir };

      // Act
      const { fileName } = publishScalarBundle(options);

      // Assert
      const published = readFileSync(join(outDir, fileName));
      expect(published.subarray(0, ZOD_JITLESS_PRELUDE.length).toString()).toBe(
        ZOD_JITLESS_PRELUDE,
      );
      expect(published.subarray(ZOD_JITLESS_PRELUDE.length)).toEqual(VENDOR_BUNDLE);
    });

    it('debería publicar un archivo que se ejecuta entero: primero el prelude y después el bundle', () => {
      // Arrange
      const page = createContext({ window: {}, console: { log: () => undefined } });
      const { fileName } = publishScalarBundle({
        vendorBundle: VENDOR_BUNDLE,
        version: '9.9.9',
        outDir,
      });

      // Act
      runInContext(readFileSync(join(outDir, fileName), 'utf-8'), page);

      // Assert
      expect(zodConfigOf(page)).toEqual({ jitless: true });
      expect((page as { window: { Scalar?: unknown } }).window.Scalar).toBeDefined();
    });

    it('debería conservar la numeración de líneas del bundle original', () => {
      // Arrange
      const vendorLines = VENDOR_BUNDLE.toString().split('\n');

      // Act
      const { fileName } = publishScalarBundle({
        vendorBundle: VENDOR_BUNDLE,
        version: '9.9.9',
        outDir,
      });

      // Assert
      const publishedLines = readFileSync(join(outDir, fileName), 'utf-8').split('\n');
      expect(publishedLines).toHaveLength(vendorLines.length);
      expect(publishedLines.slice(1)).toEqual(vendorLines.slice(1));
    });
  });

  describe('ZOD_JITLESS_PRELUDE', () => {
    it('debería crear la configuración global de Zod con jitless cuando todavía no existe', () => {
      // Arrange
      const page = createContext({});

      // Act
      runInContext(ZOD_JITLESS_PRELUDE, page);

      // Assert
      expect(zodConfigOf(page)).toEqual({ jitless: true });
    });

    it('debería añadir jitless sin reemplazar una configuración de Zod que ya exista', () => {
      // Arrange
      const existing = { customError: 'conservar' };
      const page = createContext({ __zod_globalConfig: existing });

      // Act
      runInContext(ZOD_JITLESS_PRELUDE, page);

      // Assert
      expect(zodConfigOf(page)).toBe(existing);
      expect(existing).toEqual({ customError: 'conservar', jitless: true });
    });
  });

  // El prelude solo funciona si el Zod que Scalar empaqueta sigue leyendo esa configuración
  // global y TODA sonda de eval va detrás de su guarda `jitless`. Si un bump de
  // `@scalar/api-reference` lo cambia —otro Zod, una sonda sin guarda—, el prelude deja de cubrirlo
  // y la violación vuelve en silencio: el primer caso lo convierte en un rojo en la CI del propio PR
  // de Renovate. Si Scalar dejó de traer Zod, el prelude sobra y se borra; si lo trae con otro
  // mecanismo, hay que adaptarlo. Se mide por texto sobre código minificado, así que un cambio de
  // minificador puede dar un rojo falso: preferible a un verde falso. Los dos casos sintéticos
  // fijan que la medida distingue una sonda guardada de una que no lo está.
  describe('bundle instalado de @scalar/api-reference', () => {
    it('debería traer un Zod que lee __zod_globalConfig y cuyas sondas de eval van todas detrás de jitless', () => {
      // Arrange
      const bundle = installedScalarBundle();

      // Act
      const hooks = zodHooksOf(bundle);

      // Assert
      expect(hooks.readsGlobalConfig).toBe(true);
      expect(hooks.guardedProbes).toBeGreaterThan(0);
      expect(hooks.unguardedFunctionCalls).toBe(0);
    });

    it('debería dar por buena una sonda de eval guardada por jitless', () => {
      // Arrange
      const bundle = SYNTHETIC_ZOD;

      // Act
      const hooks = zodHooksOf(bundle);

      // Assert
      expect(hooks).toEqual({
        readsGlobalConfig: true,
        guardedProbes: 1,
        unguardedFunctionCalls: 0,
      });
    });

    it('debería detectar una sonda de eval que no pasa por la guarda de jitless', () => {
      // Arrange
      const bundle = `${SYNTHETIC_ZOD}var q=()=>{try{return new Function(\`\`),!0}catch{return!1}};`;

      // Act
      const hooks = zodHooksOf(bundle);

      // Assert
      expect(hooks.unguardedFunctionCalls).toBe(1);
    });
  });
});

// Helpers

const sha256 = (content: Buffer): string => createHash('sha256').update(content).digest('hex');

const zodConfigOf = (page: Context): unknown =>
  (page as { __zod_globalConfig?: unknown }).__zod_globalConfig;

/** La forma minificada de la sonda de Zod 4.4.3 tal como está en el bundle de Scalar 1.72.1. */
const SYNTHETIC_ZOD =
  'var c=globalThis.__zod_globalConfig;' +
  'var p=()=>{if(c.jitless||typeof navigator<`u`)return!1;try{return Function(``),!0}catch{return!1}};';

/** Toda llamada a `Function(`, con o sin `new`, que no sea un método ni parte de otro nombre. */
const FUNCTION_CALL = /(?<![\w$.])(?:new\s+)?Function\s*\(/g;

/** `if(<cfg>.jitless||…)return!1;try{return Function(``)…`: la sonda, detrás de su guarda. */
const JITLESS_GUARDED_PROBE =
  /\.jitless\|\|[^{};]{0,160}\)\s*return\s*(?:!1|false)\s*;?\s*try\s*\{\s*(?:return\s+)?(?:new\s+)?Function\s*\(\s*(?:``|''|"")\s*\)/g;

const zodHooksOf = (
  bundle: string,
): { readsGlobalConfig: boolean; guardedProbes: number; unguardedFunctionCalls: number } => {
  const guardedProbes = bundle.match(JITLESS_GUARDED_PROBE)?.length ?? 0;
  return {
    readsGlobalConfig: bundle.includes('globalThis.__zod_globalConfig'),
    guardedProbes,
    unguardedFunctionCalls: (bundle.match(FUNCTION_CALL)?.length ?? 0) - guardedProbes,
  };
};

/** El bundle que `copy-scalar-asset.mjs` publicaría, leído por el mismo camino que usa él. */
const installedScalarBundle = (): string => {
  const packageDir = join(__dirname, '..', '..', 'node_modules', '@scalar', 'api-reference');
  const { browser } = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf-8')) as {
    browser: string;
  };
  return readFileSync(join(packageDir, browser), 'utf-8');
};
