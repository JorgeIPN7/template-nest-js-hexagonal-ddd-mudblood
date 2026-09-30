/**
 * Ciclo de vida del pedido. Unión y no enum, con el mismo patrón que `USER_ROLES`. Solo hay
 * dos estados: cualquier pedido `placed` se puede cancelar, sin ventana temporal, hasta que
 * exista un estado que la justifique.
 */
export const ORDER_STATUSES = ['placed', 'cancelled'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];
