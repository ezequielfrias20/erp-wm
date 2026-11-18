export function sellableStock(quantity: number, onlineHeld: number): number {
  return Math.max(0, quantity - onlineHeld);
}
