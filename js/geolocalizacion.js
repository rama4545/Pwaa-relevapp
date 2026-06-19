// js/geolocalizacion.js

const botonUbicacion = document.getElementById('botonUbicacion');
const valorLatitud   = document.getElementById('valorLatitud');
const valorLongitud  = document.getElementById('valorLongitud');
const valorPrecision = document.getElementById('valorPrecision');
const errorUbicacion = document.getElementById('errorUbicacion');

botonUbicacion.addEventListener('click', obtenerUbicacion);

function obtenerUbicacion() {
  if (!('geolocation' in navigator)) {
    mostrarErrorUbicacion('Tu navegador no soporta geolocalización.');
    return;
  }

  botonUbicacion.textContent = '⏳ Obteniendo ubicación...';
  botonUbicacion.disabled = true;
  errorUbicacion.style.display = 'none';

  // Intentamos primero con alta precisión (GPS real)
  navigator.geolocation.getCurrentPosition(
    mostrarUbicacion,
    manejarErrorGeo,
    {
      enableHighAccuracy: true,
      timeout: 12000,
      maximumAge: 0
    }
  );
}

function mostrarUbicacion(posicion) {
  const latitud   = posicion.coords.latitude;
  const longitud  = posicion.coords.longitude;
  const precision = posicion.coords.accuracy;

  valorLatitud.textContent   = latitud.toFixed(6) + '°';
  valorLongitud.textContent  = longitud.toFixed(6) + '°';

  // Mostramos la precisión con un indicador visual de calidad
  const precisionMetros = Math.round(precision);
  valorPrecision.textContent = precisionMetros + ' m';

  // Si la precisión es mayor a 500m, avisamos que es poco confiable, eso pasa cuando el GPS no está disponible y usa WiFi o IP
  if (precisionMetros > 500) {
    mostrarErrorUbicacion(
      `⚠️ Precisión baja (${precisionMetros} m). Activá el GPS del celular y probá al aire libre para obtener una ubicación exacta.`
    );
  } else if (precisionMetros > 100) {
    mostrarErrorUbicacion(
      `ℹ️ Precisión moderada (${precisionMetros} m). El mapa puede no ser exacto.`
    );
  } else {
    errorUbicacion.style.display = 'none';
  }

  botonUbicacion.textContent = '✅ Ubicación Obtenida';
  botonUbicacion.disabled = false;

  mostrarEnMapa(latitud, longitud);
}

function manejarErrorGeo(error) {
  let mensaje = '';

  switch (error.code) {
    case error.PERMISSION_DENIED:
      mensaje = '❌ Permiso denegado. Habilitá la ubicación en la configuración del navegador.';
      break;
    case error.POSITION_UNAVAILABLE:
      mensaje = '❌ Ubicación no disponible. Verificá que el GPS esté activado.';
      break;
    case error.TIMEOUT:
      mensaje = '❌ Tiempo agotado. Intentá al aire libre o con el GPS activado.';
      break;
    default:
      mensaje = '❌ No se pudo obtener la ubicación.';
  }

  mostrarErrorUbicacion(mensaje);
  botonUbicacion.textContent = '🌐 Obtener Ubicación';
  botonUbicacion.disabled = false;
}

function mostrarErrorUbicacion(mensaje) {
  errorUbicacion.textContent = mensaje;
  errorUbicacion.style.display = 'block';
}
