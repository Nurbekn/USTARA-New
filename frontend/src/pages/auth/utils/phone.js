export const formatPhone = (value) => {
  const d = value.replace(/\D/g, "").slice(0, 9);
  return [d.slice(0, 2), d.slice(2, 5), d.slice(5, 9)]
    .filter(Boolean)
    .join(" ");
};
