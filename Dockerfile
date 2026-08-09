# syntax=docker/dockerfile:1

# ------------------------------------------------------------------------------------
# Base: fija la versión de Node del repo (.nvmrc) y habilita el pnpm de `packageManager`.
# ------------------------------------------------------------------------------------
FROM node:22.22.1-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
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
