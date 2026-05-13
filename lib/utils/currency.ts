export function formatCurrency(amount: number, currency: string): string {
  if (currency === "RSD") {
    return `${Math.round(amount).toLocaleString("sr-RS")} RSD`;
  }
  if (currency === "EUR") {
    return `€${amount.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  if (currency === "USD") {
    return `$${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return `${amount.toFixed(2)} ${currency}`;
}
