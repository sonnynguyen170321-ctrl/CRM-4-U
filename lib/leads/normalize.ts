export function normalizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '');
}

export function normalizeLinkedIn(linkedIn: string): string {
  return linkedIn.toLowerCase().trim();
}
