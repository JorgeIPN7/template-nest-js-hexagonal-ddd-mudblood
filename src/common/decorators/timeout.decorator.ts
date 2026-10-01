import { Reflector } from '@nestjs/core';

export const SkipTimeout = Reflector.createDecorator<boolean>({
  transform: (value) => value ?? true,
});

export const TimeoutMs = Reflector.createDecorator<number>();

/**
 * El `message` del 408 que responde `TimeoutInterceptor`, y el mismo que publica el ejemplo de
 * `@ApiStandardErrors()`: una sola constante para que el ejemplo no pueda mentir sobre lo que se
 * envía. Su spec fija que el interceptor la usa.
 */
export const REQUEST_TIMEOUT_MESSAGE = 'Request timeout';
