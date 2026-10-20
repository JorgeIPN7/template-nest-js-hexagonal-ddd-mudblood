import {
  AdvancedConsoleLogger,
  type LoggerOptions,
  type LogLevel,
  type LogMessageType,
  type ObjectLiteral,
  type QueryRunner,
} from 'typeorm';

/** Las opciones del `DataSource` de las que se lee `logging`. */
type LoggingSource = { readonly logging?: LoggerOptions };

/**
 * El logger de TypeORM de siempre, pero sin los parámetros de las consultas (backlog #40).
 *
 * Con `DB_LOGGING=true`, `AdvancedConsoleLogger` añade `-- PARAMETERS: [...]` a cada consulta, y
 * el INSERT de una credencial —el del seed y el de cada `POST /auth/register`— lleva el hash
 * argon2id. Ese log va directo a la consola y no pasa por la redacción de pino. Al depurar se ve
 * la consulta con sus `$1`, `$2`…, pero no sus valores: es el precio de poder encenderlo con
 * credenciales reales.
 *
 * **Lee `logging` de las opciones del `DataSource` en cada llamada,** no una vez al construirse.
 * Cada comando de la CLI de TypeORM fija el suyo con `setOptions` (`migration:show` pide
 * `['schema']`), y `setOptions` recrea el logger con `LoggerFactory.create`, que devuelve tal cual
 * una instancia: con el valor del constructor, `pnpm migration:show` saldría con 0 sin listar
 * nada. `setOptions` hace `Object.assign` sobre el mismo objeto de opciones, así que basta con
 * leerlo de ahí; por eso `data-source.ts` no copia las opciones con un spread.
 *
 * Se sobrescriben los tres métodos públicos que reciben parámetros, no el helper protegido que
 * los formatea: el contrato estable es la interfaz `Logger`. El error de `logQueryError` se pasa
 * como `String(error)`, que es nombre y mensaje, sin el `detail` de PostgreSQL, donde va la fila
 * entera en una violación de constraint.
 */
export class ParameterFreeLogger extends AdvancedConsoleLogger {
  constructor(private readonly source: LoggingSource) {
    super(source.logging);
  }

  override logQuery(
    query: string,
    _parameters?: unknown[] | ObjectLiteral,
    queryRunner?: QueryRunner,
  ): void {
    super.logQuery(query, undefined, queryRunner);
  }

  override logQueryError(
    error: string | Error,
    query: string,
    _parameters?: unknown[] | ObjectLiteral,
    queryRunner?: QueryRunner,
  ): void {
    super.logQueryError(String(error), query, undefined, queryRunner);
  }

  override logQuerySlow(
    time: number,
    query: string,
    _parameters?: unknown[] | ObjectLiteral,
    queryRunner?: QueryRunner,
  ): void {
    super.logQuerySlow(time, query, undefined, queryRunner);
  }

  // Todos los métodos de `AbstractLogger` preguntan aquí antes de escribir, y aquí se lee el
  // `logging` vigente. Copiar las reglas de cada nivel duplicaría las de TypeORM.
  //
  // Solo se adopta un valor verdadero, igual que `setOptions`, que solo recrea el logger en ese
  // caso: con el `false` de `migration:generate` y `schema:log`, el logger conserva el de
  // `DB_LOGGING`, y la salida de esos comandos no cambia.
  protected override isLogEnabledFor(type?: LogLevel | LogMessageType): boolean {
    if (this.source.logging) {
      this.options = this.source.logging;
    }
    return super.isLogEnabledFor(type);
  }
}
