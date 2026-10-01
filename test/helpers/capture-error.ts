/**
 * Lo que una función lanza o una promesa rechaza, para afirmar sobre el error en sí —su clase,
 * su mensaje, su `cause`— y no solo sobre que hubo uno.
 *
 * Existe porque cada spec tenía su copia con otro nombre (`captureError`, `catchError`,
 * `thrownBy`, `captureRejection`), con tipos de retorno y centinelas distintos, y un `grep` por
 * el nombre no las encontraba juntas.
 *
 * El centinela se lanza FUERA del try/catch: dentro, ese mismo `throw` caería en el catch y el
 * test vería el centinela como si fuera el error del SUT, sin llegar nunca a decir qué pasó.
 */
export const captureError = (fn: () => unknown): Error => {
  try {
    fn();
  } catch (error) {
    return error as Error;
  }
  throw new Error('Se esperaba que la función lanzara un error y no lo hizo');
};

export const captureRejection = async (promise: Promise<unknown>): Promise<Error> => {
  try {
    await promise;
  } catch (error) {
    return error as Error;
  }
  throw new Error('Se esperaba que la promesa se rechazara y no lo hizo');
};
