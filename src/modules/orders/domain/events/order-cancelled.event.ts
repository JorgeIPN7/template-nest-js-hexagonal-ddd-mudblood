/**
 * Evento de dominio, plano como `OrderPlaced`: el payload viaja tal cual a la fila del
 * outbox. No lleva importe: quien lo consuma y lo necesite lo tiene en su `OrderPlaced`.
 */
export class OrderCancelled {
  constructor(
    readonly orderId: string,
    readonly customerId: string,
    readonly occurredAt: Date,
  ) {}
}
