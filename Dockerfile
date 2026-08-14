# syntax=docker/dockerfile:1

# ------------------------------------------------------------------------------------
# Base: fija la versión de Node del repo (.nvmrc) y habilita el pnpm de `packageManager`.
# ------------------------------------------------------------------------------------
FROM node:22.22.1-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
# `apk upgrade` no es tidying: una imagen base se publica con los paquetes del día en que se
# construyó, y los CVE del sistema aparecen DESPUÉS. Medido el 2026-08-14 sobre esta misma
# `node:22.22.1-alpine`: 15 vulnerabilidades HIGH/CRITICAL con fix publicado —libcrypto3/libssl3
# 3.5.5-r0 (CVE-2026-31789 es CRITICAL), musl 1.2.5-r21, zlib 1.3.1-r2— que ponían rojo el gate
# de trivy de ci.yml sin que nada de este repo hubiera cambiado. El repo de Alpine 3.23 ya servía
# las versiones parcheadas, así que el arreglo es pedirlas, no esperar a que Node republique.
#
# El precio, dicho sin adornos: esta línea hace el build NO reproducible — la misma instrucción
# instala paquetes distintos según el día. Se acepta a conciencia. La alternativa determinista
# (`apk add libcrypto3=3.5.7-r0 …`) se rompe sola en cuanto Alpine retira esa revisión exacta del
# repositorio, que es cuestión de semanas, y además vuelve a dejar el parcheado a merced de que
# alguien acuerde de subir el número a mano.
#
# Va en `base` y no en cada stage por eficiencia: es una sola capa que deps/build/production
# heredan, así que cubrir los cuatro cuesta exactamente una ejecución.
RUN apk upgrade --no-cache && corepack enable
WORKDIR /app

# ------------------------------------------------------------------------------------
# Dependencias: capa cacheable — solo se invalida si cambian los manifiestos.
# ------------------------------------------------------------------------------------
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

# ------------------------------------------------------------------------------------
# Build: compila con SWC y copia el bundle de Scalar a public/.
# ------------------------------------------------------------------------------------
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# El hook `prebuild` ejecuta scripts/copy-scalar-asset.mjs, que resuelve el bundle por el campo
# `browser` del package.json —nunca por una ruta escrita a mano, que se rompería en el siguiente
# major— y aborta si el resultado pesa menos de 1 MB. Un `cp` que copia nada y devuelve 0 es el
# fallo que eso evita: se descubriría al abrir la documentación, no al construir.
RUN pnpm build

# ------------------------------------------------------------------------------------
# Producción: solo dependencias de runtime y el build.
# ------------------------------------------------------------------------------------
FROM base AS production
ENV NODE_ENV=production

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# `--ignore-scripts` es obligatorio junto a `--prod`: pnpm ejecuta el hook `prepare` del
# proyecto raíz también en instalaciones de producción, y `prepare` invoca a `husky`, que
# es devDependency. Sin esto el stage falla con `husky: command not found`. Poner HUSKY=0
# no sirve — el binario directamente no está instalado.
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --prod --ignore-scripts

COPY --from=build /app/dist ./dist
# El bundle de Scalar vive fuera de `dist` a propósito: `nest-cli.json` declara
# `deleteOutDir: true`, y eso vacía `dist` tanto en `nest build` como en `nest start --watch`.
# Dentro, el asset desaparecería en desarrollo mientras sobrevivía aquí — un fallo que solo se
# ve en la máquina de quien programa.
COPY --from=build /app/public ./public

# Dos aserciones sobre el resultado, no sobre la intención.
#
# `@scalar/api-reference` es devDependency: solo el builder la necesita para resolver el bundle.
# Si acabara en `dependencies`, `--prod` metería sus 14 MB y la imagen pesaría más que antes de
# migrar. La regresión sería invisible —todo funciona, solo pesa de más— así que se comprueba.
#
# Y sin el manifiesto, `setupOpenApi` lanza al arrancar: mejor descubrirlo construyendo.
RUN if [ -d node_modules/@scalar/api-reference ]; then \
      echo "@scalar/api-reference no debe estar en la imagen final: muévela a devDependencies."; \
      exit 1; \
    fi && \
    if [ ! -f public/scalar-asset.json ]; then \
      echo "Falta el bundle de Scalar en public/."; \
      exit 1; \
    fi

# npm fuera de la imagen final. No es una optimización de tamaño (~10 MB), es superficie: el npm
# global que viaja dentro de `node:*-alpine` empaqueta su propio árbol en
# /usr/local/lib/node_modules/npm, y ese árbol es el que aportaba 34 de las vulnerabilidades
# HIGH/CRITICAL del scan del 2026-08-14 —`tar` 6.2.1 y 7.4.3 (CVE-2026-59873, CRITICAL),
# `brace-expansion`, `minimatch`, `glob`, `picomatch`, `ip-address`, `sigstore`—. Ni una sola
# venía de `app/node_modules`: las dependencias de este repo salieron limpias.
#
# Subir de versión no cierra esto, se midió antes de escribir la línea: `node:22-alpine` (22.23.2)
# deja 8 y `node:24-alpine` (24.19.0, npm 11.17.0) deja 7, todas del mismo directorio. Mientras
# npm viaje en la imagen publicada, el gate seguirá rojo con cualquier Node.
#
# Y nada de esto hace falta en runtime: el CMD es `node dist/src/main`, y quien instala es
# corepack+pnpm, que sí se conservan. Se borra DESPUÉS del install, no antes, para no invalidar
# esa capa de caché ni arriesgar un script de instalación que invocara npm.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx

# Nunca correr como root. La imagen de Node ya trae el usuario `node`.
USER node

EXPOSE 8888

# El healthcheck usa liveness, no readiness: readiness comprueba Postgres, y Docker
# reiniciaría el contenedor por una caída de la base que reiniciar no arregla.
# La versión sale de API_VERSION igual que el prefijo de GLOBAL_PREFIX; hardcodear `/v1`
# dejaba el contenedor `unhealthy` para siempre en cuanto se subiera a API_VERSION=2.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8888)+'/'+(process.env.GLOBAL_PREFIX||'api')+'/v'+(process.env.API_VERSION||1)+'/health/liveness').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/src/main"]
