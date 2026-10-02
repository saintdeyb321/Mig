export const getValidDate = (d) => {
  if (!d) return new Date();
  if (d?.toDate) return d.toDate();
  return new Date(d);
};

export const getLocalDateStr = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

export const formatDate = (date) => date.toLocaleDateString("es-PE");
export const formatTime = (date) => date.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });