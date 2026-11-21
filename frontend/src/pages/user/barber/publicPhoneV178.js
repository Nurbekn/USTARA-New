// #159: public barber contact only. Never build links from customer phones or untrusted markup.
export function publicBarberPhoneHrefV178(value) {
  return typeof value === "string" && /^\+[1-9][0-9]{7,14}$/.test(value) ? `tel:${value}` : null;
}
