import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { stripVTControlCharacters } from 'node:util';

import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { ZodError } from 'zod';

import { createTestApp } from '@test/helpers/create-test-app';

import { seedAdmin } from '../seeds/seed-admin';

/** Cumple `PASSWORD_LENGTH` de `src/config/password-policy.ts`; el valor en sí es irrelevante. */
const ADMIN_PASSWORD = 'Password-Segura-1';
const ADMIN_EMAIL = 'primer.admin@example.com';

/** Constraint temporal con la que el E2E del CLI fuerza a fallar la escritura de la credencial. */
const REJECT_ARGON2_CONSTRAINT = 'seed_e2e_reject_argon2';
const REPO_ROOT = join(__dirname, '..', '..', '..');

/**
 * E2E contra PostgreSQL real: `seedAdmin` habla SQL crudo directamente —no pasa por
 * `UserMapper`, `CredentialMapper` ni sus repositorios—, así que mockear la base eliminaría
 * justo lo que hay que verificar: que ese SQL, contra el esquema real, hace lo que dice.
 *
 * Desde el ciclo 4 el seed escribe DOS tablas en una transacción (perfil + credencial), y
 * esta suite lo comprueba en las dos direcciones: que ambas filas aparecen, y que el admin
 * puede autenticarse de verdad con el password sembrado.
 *
 * `process.env.ADMIN_EMAIL`/`ADMIN_PASSWORD` se guardan una vez y se restauran tras
 * cada test: es la única forma de inyectar el par en un flujo de CLI, que no tiene
 * puerto HTTP que apuntar. El `TRUNCATE` en cada `beforeEach` seguido de un `dataSource`
 * crudo —y no `.clear()` sobre las ORM entities— porque el propio seed nunca pasa por el
 * ORM: mantener el test en el mismo registro (SQL) que el código bajo prueba.
 */
describe('seedAdmin (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let prefix: string;
  let originalAdminEmail: string | undefined;
  let originalAdminPassword: string | undefined;

  beforeAll(async () => {
    ({ app, prefix } = await createTestApp());
    dataSource = app.get(DataSource);
    originalAdminEmail = process.env.ADMIN_EMAIL;
    originalAdminPassword = process.env.ADMIN_PASSWORD;
  });

  beforeEach(async () => {
    // Por si una pasada anterior se cortó durante el caso del CLI, sin llegar al `afterEach`.
    await dataSource.query(
      `ALTER TABLE auth_credentials DROP CONSTRAINT IF EXISTS ${REJECT_ARGON2_CONSTRAINT}`,
    );
    await dataSource.query('TRUNCATE TABLE auth_credentials');
    await dataSource.query('TRUNCATE TABLE users CASCADE');
  });

  afterEach(async () => {
    restoreEnv();
    await dataSource.query(
      `ALTER TABLE auth_credentials DROP CONSTRAINT IF EXISTS ${REJECT_ARGON2_CONSTRAINT}`,
    );
  });

  afterAll(async () => {
    restoreEnv();
    await app.close();
  });

  it('debería crear el admin en la primera ejecución y permitir loguear con ese password', async () => {
    // Arrange
    setEnv(ADMIN_EMAIL, ADMIN_PASSWORD);

    // Act
    const result = await seedAdmin(dataSource);

    // Assert
    expect(result).toBe('created');
    const rows = await queryUser(ADMIN_EMAIL);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.role).toBe('admin');

    const login = await request(app.getHttpServer())
      .post(`${prefix}/auth/login`)
      .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
    expect(login.status).toBe(200);
    expect(login.body.data.user.role).toBe('admin');
  });

  // El caso que el ciclo 4 añade: sin la credencial, el admin existiría pero no podría
  // entrar — y el login de arriba ya no bastaría para distinguir «no la escribió» de «la
  // escribió mal», porque ambos fallan igual. Aquí se mira la fila cruda.
  it('debería escribir la credencial del admin en auth_credentials, ligada a su perfil', async () => {
    // Arrange
    setEnv(ADMIN_EMAIL, ADMIN_PASSWORD);

    // Act
    await seedAdmin(dataSource);

    // Assert
    const rows = await dataSource.query<{ user_id: string; password_hash: string }[]>(
      `SELECT c.user_id, c.password_hash FROM auth_credentials c
       JOIN users u ON u.id = c.user_id WHERE u.email = $1`,
      [ADMIN_EMAIL],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.password_hash.startsWith('$argon2id$')).toBe(true);
  });

  it('debería devolver "promoted" y no duplicar la fila en una segunda ejecución', async () => {
    // Arrange
    setEnv(ADMIN_EMAIL, ADMIN_PASSWORD);
    await seedAdmin(dataSource);

    // Act
    const result = await seedAdmin(dataSource);

    // Assert
    expect(result).toBe('promoted');
    const rows = await queryUser(ADMIN_EMAIL);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.role).toBe('admin');
    const credentials = await dataSource.query<{ count: number }[]>(
      'SELECT COUNT(*)::int AS count FROM auth_credentials',
    );
    expect(credentials[0]?.count).toBe(1);
  });

  it('debería promover a un usuario preexistente con ese email conservando su nombre', async () => {
    // Arrange
    const existingName = 'Usuario Preexistente';
    await dataSource.query(
      `INSERT INTO users (id, email, name, role, active, "createdAt", "updatedAt")
       VALUES ($1, $2, $3, 'user', true, now(), now())`,
      [randomUUID(), ADMIN_EMAIL, existingName],
    );
    setEnv(ADMIN_EMAIL, ADMIN_PASSWORD);

    // Act
    const result = await seedAdmin(dataSource);

    // Assert
    expect(result).toBe('promoted');
    const rows = await queryUser(ADMIN_EMAIL);
    expect(rows[0]?.name).toBe(existingName);
    expect(rows[0]?.role).toBe('admin');
  });

  // El perfil preexistente no tenía credencial (nació antes de este ciclo, o su alta se
  // compensó a medias): el seed debe DARLE una, no solo cambiarle el rol. Sin el
  // `ON CONFLICT`… `INSERT` del upsert, promover dejaría un admin que no puede entrar.
  it('debería crear la credencial de un usuario preexistente que no la tenía', async () => {
    // Arrange
    await dataSource.query(
      `INSERT INTO users (id, email, name, role, active, "createdAt", "updatedAt")
       VALUES ($1, $2, 'Sin Credencial', 'user', true, now(), now())`,
      [randomUUID(), ADMIN_EMAIL],
    );
    setEnv(ADMIN_EMAIL, ADMIN_PASSWORD);

    // Act
    await seedAdmin(dataSource);

    // Assert
    const login = await request(app.getHttpServer())
      .post(`${prefix}/auth/login`)
      .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
    expect(login.status).toBe(200);
  });

  // El escenario de rescate, y el único en el que este seed es la herramienta documentada:
  // se desactiva por error la única cuenta admin y todo endpoint `@Auth('admin')` queda
  // inalcanzable. La aserción es el login y no `active` en la fila: `LoginUseCase` rechaza al
  // inactivo con el mismo `InvalidCredentialsError` que una contraseña mala, así que el 200 es
  // lo único que distingue "rescatado" de "sigue sin poder entrar". Sin `active = true` en el
  // UPDATE, el seed devuelve 'promoted' —éxito aparente— y esto sigue en 401.
  it('debería reactivar al admin desactivado y dejarlo entrar', async () => {
    // Arrange
    await dataSource.query(
      `INSERT INTO users (id, email, name, role, active, "createdAt", "updatedAt")
       VALUES ($1, $2, 'Admin Desactivado', 'admin', false, now(), now())`,
      [randomUUID(), ADMIN_EMAIL],
    );
    setEnv(ADMIN_EMAIL, ADMIN_PASSWORD);

    // Act
    const result = await seedAdmin(dataSource);

    // Assert
    expect(result).toBe('promoted');
    const login = await request(app.getHttpServer())
      .post(`${prefix}/auth/login`)
      .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
    expect(login.status).toBe(200);
    expect(login.body.data.user.active).toBe(true);
  });

  // El otro rescate: una credencial con un id uuid válido pero no v4, que solo deja un SQL
  // externo, hace que el login responda 500. Sin renovar el id, el seed devolvería 'promoted'
  // —éxito aparente— y el login seguiría en 500.
  it('debería renovar con un uuid v4 la credencial del admin cuyo id no es v4 y dejarlo entrar', async () => {
    // Arrange
    const corruptId = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';
    setEnv(ADMIN_EMAIL, ADMIN_PASSWORD);
    await seedAdmin(dataSource);
    await dataSource.query(
      'UPDATE auth_credentials SET id = $1 WHERE user_id = (SELECT id FROM users WHERE email = $2)',
      [corruptId, ADMIN_EMAIL],
    );

    // Act
    const result = await seedAdmin(dataSource);

    // Assert: la forma del v4 según RFC 4122, no la regex del dominio, que se probaría contra sí
    // misma. La versión vive en la posición 14 y la variante en la 19.
    expect(result).toBe('promoted');
    const login = await request(app.getHttpServer())
      .post(`${prefix}/auth/login`)
      .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
    expect(login.status).toBe(200);
    const rows = await dataSource.query<{ id: string }[]>(
      'SELECT id FROM auth_credentials WHERE user_id = (SELECT id FROM users WHERE email = $1)',
      [ADMIN_EMAIL],
    );
    const renewedId = rows[0]?.id ?? '';
    expect(renewedId).not.toBe(corruptId);
    expect(renewedId).toHaveLength(36);
    expect(renewedId[14]).toBe('4');
    expect(['8', '9', 'a', 'b']).toContain(renewedId[19]);
  });

  // Backlog #41: el id del perfil no se puede renovar como el de la credencial, porque
  // `orders.customer_id` lo guarda por valor. Sin la comprobación, el seed devolvía 'promoted'
  // —éxito aparente— y el login seguía en 500, porque `UserMapper` falla cerrado. El perfil es un
  // usuario corriente, inactivo y con credencial, para que cualquier escritura se notara.
  it('debería fallar con un mensaje explícito, sin tocar auth_credentials ni el perfil, cuando el users.id del admin no es v4', async () => {
    // Arrange
    const v1Id = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';
    await dataSource.query(
      `INSERT INTO users (id, email, name, role, active, "createdAt", "updatedAt")
       VALUES ($1, $2, 'Perfil v1', 'user', false, now(), now())`,
      [v1Id, ADMIN_EMAIL],
    );
    await dataSource.query(
      `INSERT INTO auth_credentials (id, user_id, password_hash, "createdAt", "updatedAt")
       VALUES ($1, $2, 'hash-anterior', now(), now())`,
      [randomUUID(), v1Id],
    );
    const before = await queryProfileAndCredential(v1Id);
    setEnv(ADMIN_EMAIL, ADMIN_PASSWORD);

    // Act
    const seeding = seedAdmin(dataSource);

    // Assert
    await expect(seeding).rejects.toThrow(
      `seed:admin: el users.id del admin (${v1Id}) no es un uuid v4 y el login respondería 500. ` +
        'No se renueva como el de la credencial porque orders.customer_id lo referencia por valor: ' +
        'corrígelo con SQL. No se ha escrito nada.',
    );
    expect(await queryProfileAndCredential(v1Id)).toEqual(before);
  });

  // Backlog #34: el esquema solo exigía 12 caracteres, así que 129 pasaban, el seed sembraba el
  // admin y `@MaxLength(128)` de `LoginDto` lo dejaba fuera para siempre con un 400. Ahora el
  // esquema rechaza lo que rechazaría el login, ANTES de abrir la transacción.
  it('debería rechazar un ADMIN_PASSWORD que el login rechazaría, sin escribir ninguna fila', async () => {
    // Arrange
    setEnv(ADMIN_EMAIL, 'a'.repeat(129));

    // Act
    const seeding = seedAdmin(dataSource);

    // Assert
    await expect(seeding).rejects.toBeInstanceOf(ZodError);
    const counts = await dataSource.query<{ users: number; credentials: number }[]>(
      `SELECT (SELECT COUNT(*)::int FROM users) AS users,
              (SELECT COUNT(*)::int FROM auth_credentials) AS credentials`,
    );
    expect(counts[0]).toEqual({ users: 0, credentials: 0 });
  });

  // Backlog #40, con el CLI real y no con la función: es el bloque CLI el que imprimía el error
  // entero. El `CHECK` rechaza los hashes argon2id, así que el error de PostgreSQL lleva el hash
  // en `detail` («Failing row contains…») y TypeORM, en `parameters`. Con `DB_LOGGING=true`, la
  // misma prueba cubre el logger de TypeORM, que imprimía los parámetros de cada INSERT.
  it('debería terminar con código 1 y sin el hash en la salida cuando falla la escritura de la credencial', async () => {
    // Arrange
    setEnv(ADMIN_EMAIL, ADMIN_PASSWORD);
    await dataSource.query(
      `ALTER TABLE auth_credentials ADD CONSTRAINT ${REJECT_ARGON2_CONSTRAINT}
       CHECK (password_hash NOT LIKE '$argon2id$%') NOT VALID`,
    );

    // Act
    const cli = await runSeedCli({ DB_LOGGING: 'true' });

    // Assert
    expect(cli.exitCode).toBe(1);
    expect(cli.stderr).toContain('[seed:admin] failed:');
    expect(cli.stderr).toContain('(código 23514)');
    // Prueba de que el logger estaba encendido en el hijo: sin ella, un `DB_LOGGING` que dejara
    // de llegarle pondría en verde la aserción de stdout también sin `ParameterFreeLogger`.
    expect(cli.stdout).toContain('INSERT INTO auth_credentials');
    expect(cli.stdout).not.toContain('$argon2id$');
    expect(cli.stderr).not.toContain('$argon2id$');
  }, 60_000);

  it('debería rechazar cuando faltan ADMIN_EMAIL o ADMIN_PASSWORD en el entorno', async () => {
    // Arrange
    delete process.env.ADMIN_EMAIL;
    delete process.env.ADMIN_PASSWORD;

    // Act + Assert
    await expect(seedAdmin(dataSource)).rejects.toThrow(
      'seed:admin necesita ADMIN_EMAIL y ADMIN_PASSWORD en el entorno (ambas).',
    );
    const rows = await dataSource.query<{ count: number }[]>(
      'SELECT COUNT(*)::int AS count FROM users',
    );
    expect(rows[0]?.count).toBe(0);
  });

  // Helpers

  function setEnv(email: string, password: string): void {
    process.env.ADMIN_EMAIL = email;
    process.env.ADMIN_PASSWORD = password;
  }

  function restoreEnv(): void {
    if (originalAdminEmail === undefined) {
      delete process.env.ADMIN_EMAIL;
    } else {
      process.env.ADMIN_EMAIL = originalAdminEmail;
    }
    if (originalAdminPassword === undefined) {
      delete process.env.ADMIN_PASSWORD;
    } else {
      process.env.ADMIN_PASSWORD = originalAdminPassword;
    }
  }

  /**
   * Lanza `pnpm seed:admin` tal cual, `ts-node src/database/seeds/seed-admin.ts`, con el entorno
   * de esta suite (la base de test y las `ADMIN_*` de `setEnv`). En modo `transpileOnly`, porque
   * los tipos ya los comprueba `pnpm typecheck` y así arranca en segundos.
   */
  function runSeedCli(
    extraEnv: Record<string, string>,
  ): Promise<{ exitCode: number | null; stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [require.resolve('ts-node/dist/bin.js'), 'src/database/seeds/seed-admin.ts'],
        {
          cwd: REPO_ROOT,
          env: { ...process.env, TS_NODE_TRANSPILE_ONLY: 'true', ...extraEnv },
          // Antes que el plazo del `it`: un hijo vivo retendría la tabla mientras el
          // `afterEach` espera su `ALTER TABLE`.
          timeout: 50_000,
        },
      );
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString()));
      child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
      child.on('error', reject);
      // Sin los códigos ANSI del resaltado de SQL, que parten las palabras y podrían partir el
      // hash y dejar en verde un `not.toContain` sin el arreglo.
      child.on('close', (exitCode) =>
        resolve({
          exitCode,
          stdout: stripVTControlCharacters(stdout),
          stderr: stripVTControlCharacters(stderr),
        }),
      );
    });
  }

  /** Las dos filas del usuario, con todo lo que el seed escribiría, para compararlas enteras. */
  function queryProfileAndCredential(userId: string): Promise<unknown[]> {
    return dataSource.query(
      `SELECT u.role, u.active, u."updatedAt" AS user_updated_at,
              c.id AS credential_id, c.password_hash, c."updatedAt" AS credential_updated_at
       FROM users u LEFT JOIN auth_credentials c ON c.user_id = u.id
       WHERE u.id = $1`,
      [userId],
    );
  }

  function queryUser(email: string): Promise<{ name: string; role: string }[]> {
    return dataSource.query<{ name: string; role: string }[]>(
      'SELECT name, role FROM users WHERE email = $1',
      [email],
    );
  }
});
