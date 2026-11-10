export const video = {id: 'MigaPOSPromo30', width: 1080, height: 1920, fps: 30, durationInFrames: 900};

export const scenes = [
  {id: 'hook', from: 0, duration: 90, title: 'Tu tienda,\nbajo control', label: 'Punto de venta', asset: 'ticket'},
  {id: 'pos', from: 90, duration: 150, title: 'Prepara\ncada ticket', label: 'Punto de venta', asset: 'ticket'},
  {id: 'inventory', from: 240, duration: 150, title: 'Consulta el stock\npor sede', label: 'Inventario', asset: 'inventory'},
  {id: 'reports', from: 390, duration: 150, title: 'Revisa tus ventas\npor período', label: 'Reportes', asset: 'reports'},
  {id: 'cash', from: 540, duration: 150, title: 'Compara el\nefectivo al cierre', label: 'Caja', asset: 'cash'},
  {id: 'montage', from: 690, duration: 120, title: 'Conoce MigaPOS', label: 'En tu tienda'},
  {id: 'cta', from: 810, duration: 90, title: 'Solicita una demostración'},
];

export const montage = ['ticket-updated', 'inventory', 'reports'];
export const reviewFrames = [36, 315, 465, 615, 870];
