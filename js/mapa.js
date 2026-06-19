// Usa Leaflet.js con tiles de OpenStreetMap
// Guardamos la instancia del mapa y el marcador para no duplicarlos
let mapaLeaflet  = null;
let marcadorMapa = null;

const mapaContenedor = document.getElementById('mapaUbicacion');
const notaMapa       = document.getElementById('notaMapa');

// Esta función es llamada desde geolocalizacion.js cuando se obtiene la posición
function mostrarEnMapa(latitud, longitud) {
  // Mostramos el contenedor del mapa
  mapaContenedor.style.display = 'block';
  notaMapa.style.display = 'none';

  // Si el mapa ya fue creado, solo actualizamos la vista y el marcador
  if (mapaLeaflet) {
    mapaLeaflet.setView([latitud, longitud], 16);
    if (marcadorMapa) {
      marcadorMapa.setLatLng([latitud, longitud]);
      marcadorMapa.getPopup().setContent(generarContenidoPopup(latitud, longitud));
    }
    return;
  }

  // Primera vez: creamos el mapa con Leaflet
  mapaLeaflet = L.map('mapaUbicacion').setView([latitud, longitud], 16);

  // Cargamos las imágenes del mapa desde OpenStreetMap (gratuito y sin API key)
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© <a href="https://www.openstreetmap.org/">OpenStreetMap</a>',
    maxZoom: 19
  }).addTo(mapaLeaflet);

  // Creamos el marcador y le agregamos un popup con las coordenadas
  marcadorMapa = L.marker([latitud, longitud])
    .addTo(mapaLeaflet)
    .bindPopup(generarContenidoPopup(latitud, longitud))
    .openPopup();


  // Este timeout fuerza que recalcule el tamaño del mapa
  setTimeout(() => {
    mapaLeaflet.invalidateSize();
  }, 200);
}

// Genera el HTML del globo que aparece sobre el marcador
function generarContenidoPopup(latitud, longitud) {
  return `
    <b>📍 Posición actual</b><br>
    <small>Lat: ${latitud.toFixed(6)}</small><br>
    <small>Lng: ${longitud.toFixed(6)}</small>
  `;
}
