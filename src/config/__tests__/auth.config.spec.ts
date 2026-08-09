import { resolveJwtSecret, ARGON2_PARAMS } from '../auth.config';
import { envSchema } from '../env.schema';

describe('resolveJwtSecret', () => {
  it('debería usar el secret del entorno cuando está definido', () => {
    // Arrange + Act
    const secret = resolveJwtSecret({ NODE_ENV: 'production', JWT_SECRET: 'x'.repeat(32) });
    // Assert
    expect(secret).toBe('x'.repeat(32));
  });

  it('debería aplicar el default inseguro solo sin secret (development)', () => {
    // Arrange + Act
    const secret = resolveJwtSecret({ NODE_ENV: 'development', JWT_SECRET: undefined });
    // Assert
    expect(secret).toContain('insecure-dev-secret');
  });
});

describe('envSchema (auth)', () => {
  it.each(['staging', 'production'] as const)('debería rechazar %s sin JWT_SECRET', (nodeEnv) => {
    // Arrange + Act
    const result = envSchema.safeParse({ NODE_ENV: nodeEnv });
    // Assert
    expect(result.success).toBe(false);
  });

  it('debería aceptar development sin JWT_SECRET', () => {
    // Arrange + Act
    const result = envSchema.safeParse({ NODE_ENV: 'development' });
    // Assert
    expect(result.success).toBe(true);
  });

  it('debería rechazar ADMIN_EMAIL sin ADMIN_PASSWORD', () => {
    // Arrange + Act
    const result = envSchema.safeParse({ NODE_ENV: 'development', ADMIN_EMAIL: 'a@b.com' });
    // Assert
    expect(result.success).toBe(false);
  });

  it('debería rechazar un JWT_SECRET más corto que 32 caracteres', () => {
    // Arrange + Act
    const result = envSchema.safeParse({ NODE_ENV: 'development', JWT_SECRET: 'corto' });
    // Assert
    expect(result.success).toBe(false);
  });
});

describe('ARGON2_PARAMS', () => {
  it('debería fijar los parámetros OWASP explícitos', () => {
    // Arrange + Act + Assert
    expect(ARGON2_PARAMS).toEqual({ type: 2, memoryCost: 65_536, timeCost: 3, parallelism: 4 });
  });
});
