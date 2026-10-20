/**
 * Lo que imprime `pnpm seed:admin` cuando falla: el mensaje y, si existe, el código. Nada más
 * (backlog #40).
 *
 * El CLI hacía `console.error(error)`, y `util.inspect` vuelca todas las propiedades del error.
 * Un `QueryFailedError` de TypeORM guarda `parameters`, los del INSERT de la credencial, y en una
 * violación de constraint PostgreSQL pone en `detail` la fila entera: los dos llevan el hash
 * argon2id. Ese texto acaba en el agregador de logs del Job que lance el seed. La redacción de
 * pino no ayuda, porque el CLI no pasa por pino.
 *
 * Solo se acepta un `code` de texto: es lo que usan los dos emisores reales, PostgreSQL (SQLSTATE,
 * `23505`) y Node (`ECONNREFUSED`). Un valor lanzado que no es un `Error` se convierte con
 * `String()`, que nunca vuelca sus propiedades.
 */
export const formatSeedError = (error: unknown): string => {
  if (!(error instanceof Error)) {
    return String(error);
  }
  const code: unknown = (error as { code?: unknown }).code;
  return typeof code === 'string' ? `${error.message} (código ${code})` : error.message;
};
