// Nombre del caché — si cambiamos esto, se invalida el caché anterior
const NOMBRE_CACHE = 'relevapp-cache-v6';
// Lista de archivos que queremos guardar para usar sin conexión
const ARCHIVOS_A_CACHEAR = [
   './',
  './index.html',
  './estilos.css',
  './manifest.json',
  './iconos/icono-192.png',
  './iconos/icono-512.png',
  './js/camara.js',
  './js/ocr.js',
  './js/portapapeles.js',
  './js/geolocalizacion.js',
  './js/mapa.js',
  './js/app.js',
  // Librerías externas que también queremos cachear
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js'
];

// Se ejecuta la primera vez que se instala el SW
self.addEventListener('install', (evento) => {
  console.log('[SW] Instalando Service Worker...');

  // waitUntil hace que el SW no se active hasta que el caché esté listo
  evento.waitUntil(
    caches.open(NOMBRE_CACHE)
      .then((cache) => {
        console.log('[SW] Guardando archivos en caché...');
        // Guardamos todos los archivos de la lista
        return cache.addAll(ARCHIVOS_A_CACHEAR);
      })
      .then(() => {
        console.log('[SW] ✅ Todos los archivos cacheados correctamente');
        // Activamos el SW inmediatamente sin esperar a que se cierre la pestaña
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error('[SW] ❌ Error al cachear archivos:', error);
      })
  );
});


// Se ejecuta cuando el SW toma el control
self.addEventListener('activate', (evento) => {
  console.log('[SW] Activando Service Worker...');

  evento.waitUntil(
    // Borramos cachés viejos que ya no necesitamos
    caches.keys().then((nombresCache) => {
      return Promise.all(
        nombresCache
          .filter((nombre) => nombre !== NOMBRE_CACHE) 
          .map((nombre) => {
            console.log('[SW] Borrando caché viejo:', nombre);
            return caches.delete(nombre);
          })
      );
    }).then(() => {
      // Tomamos control de todas las pestañas abiertas
      return self.clients.claim();
    })
  );
});


// Se intercepta cada vez que la app pide un recurso
self.addEventListener('fetch', (evento) => {

  // Estrategia: Cache First (primero buscamos en caché, si no hay, pedimos a internet)
  evento.respondWith(
    caches.match(evento.request)
      .then((respuestaEnCache) => {

        // Si encontramos el archivo en caché, lo devolvemos directamente
        if (respuestaEnCache) {
          return respuestaEnCache;
        }

        // Si no está en caché, lo pedimos a la red
        return fetch(evento.request)
          .then((respuestaRed) => {
            // Nos aseguramos que la respuesta sea válida
            if (!respuestaRed || respuestaRed.status !== 200 || respuestaRed.type === 'opaque') {
              return respuestaRed;
            }

            // Guardamos una copia en caché para la próxima vez
            const respuestaClon = respuestaRed.clone();
            caches.open(NOMBRE_CACHE).then((cache) => {
              cache.put(evento.request, respuestaClon);
            });

            return respuestaRed;
          })
          .catch(() => {
            // Si no hay red y tampoco está en caché, devolvemos la página principal
            if (evento.request.destination === 'document') {
            return caches.match('/Pwaa-relevapp/index.html'); }
          });
      })
  );
});
