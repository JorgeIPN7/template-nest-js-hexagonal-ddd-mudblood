import type { INestApplication } from '@nestjs/common';
import { ThrottlerStorage, ThrottlerStorageService } from '@nestjs/throttler';

/**
 * Vacía los contadores del rate limiter de una app bajo test.
 *
 * Hace falta desde que `POST /auth/register` tiene el MISMO límite propio que el login
 * (10/min): una suite E2E que da de alta más de diez cuentas contra la misma app agotaría el
 * cupo y empezaría a recibir 429 donde espera 201 — un rojo que no habla del código bajo
 * prueba sino del presupuesto de peticiones del test.
 *
 * La alternativa era repartir los tests entre varias apps hasta que ninguna pasara de diez
 * altas, y eso ata la ESTRUCTURA de la suite a un número de configuración: subir el límite a
 * 20 dejaría media suite con apps de más, y bajarlo a 5 la rompería sin tocar una sola
 * aserción. Vaciar el contador entre tests independiza una cosa de la otra.
 *
 * **No sirve para probar el límite en sí**: los `describe` que miden el 429 usan su propia
 * app y NO llaman a esta función — si lo hicieran, borrarían justo lo que están midiendo.
 *
 * `storage` es un getter público de `ThrottlerStorageService` que devuelve el `Map` real, así
 * que esto no toca nada privado. El `instanceof` cubre el día en que el storage se sustituya
 * por Redis: entonces esta función dejaría de vaciar en silencio, y el guard es preferible a
 * un `as` que fingiría lo contrario.
 *
 * **Vaciar solo `storage` NO reinicia nada** (verificado contra @nestjs/throttler 6.7.1). La
 * cuenta real vive en `hitExpirations`, un `Map` PRIVADO y separado con la caducidad de cada
 * hit: en cada petición `pruneExpiredHits()` recalcula `totalHits` a partir de él. Si solo se
 * vacía `storage`, la siguiente petición recrea el registro a cero y ese mismo paso le
 * devuelve todos los hits vivos: el contador sale intacto. Medido sobre el paquete instalado:
 * tres hits, `storage.clear()` y un cuarto dan `totalHits: 4`; con `onApplicationShutdown()`
 * delante, 1.
 *
 * `onApplicationShutdown()` es el ÚNICO miembro público que vacía `hitExpirations`. Su cuerpo
 * entero es parar el intervalo de barrido y hacer `clear()` de los dos mapas; `increment()`
 * rearranca el barrido con `ensureSweep()` en la siguiente petición, así que llamarlo aquí es
 * exacto y no deja el servicio inservible. El `storage.clear()` de después es redundante
 * desde 6.7: se queda porque no cuesta nada y no ata el reset a que el hook siga vaciando
 * ambos mapas en la próxima versión.
 *
 * Hasta 6.5.0 el motivo era otro: cada hit programaba un `setTimeout` que descontaba de
 * `storage` al vencer, y vaciar solo el `Map` dejaba temporizadores huérfanos que reventaban
 * con `TypeError: Cannot destructure property 'totalHits'` dentro del worker de Jest. 6.7
 * reescribió el storage sin temporizadores por hit y ese fallo ya no puede ocurrir.
 */
export const resetThrottler = (app: INestApplication): void => {
  const storage = app.get<ThrottlerStorage>(ThrottlerStorage, { strict: false });
  if (!(storage instanceof ThrottlerStorageService)) {
    throw new Error(
      'resetThrottler solo sabe vaciar el storage en memoria de @nestjs/throttler; ' +
        'con un storage externo (Redis) hay que vaciarlo por su propia API.',
    );
  }
  storage.onApplicationShutdown();
  storage.storage.clear();
};
