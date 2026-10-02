// src/utils/security.js

export const getOfficialTime = async () => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3000); // Timeout de 3 segundos

  try {
    const response = await fetch('https://timeapi.io/api/Time/current/zone?timeZone=America/Lima', {
      signal: controller.signal
    });
    clearTimeout(timeoutId); // Si la respuesta llega antes del timeout, limpiamos el temporizador

    if (!response.ok) throw new Error('API offline');

    const data = await response.json();
    const apiDate = new Date(data.dateTime);

    return apiDate.getHours().toString().padStart(2, '0') + ":" +
           apiDate.getMinutes().toString().padStart(2, '0');
  } catch (error) {
    clearTimeout(timeoutId); // Aseguramos limpiar el timeout en caso de error también
    console.warn('No se pudo obtener la hora oficial, usando hora local:', error);
    // Si la API falla, usamos la hora local de forma silenciosa
    const local = new Date();
    return local.getHours().toString().padStart(2, '0') + ":" +
           local.getMinutes().toString().padStart(2, '0');
  }
};