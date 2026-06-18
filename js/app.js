// ==============================================
// js/app.js — Punto de entrada principal de RelevApp
// Registra el Service Worker para que funcione como PWA
// ==============================================

// Esperamos que la página cargue completamente antes de registrar el SW
window.addEventListener('load', () => {

  // Verificamos que el navegador soporte Service Workers
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('service-worker.js')
      .then((registro) => {
        console.log('✅ Service Worker registrado. Scope:', registro.scope);
      })
      .catch((error) => {
        console.error('❌ Error al registrar el Service Worker:', error);
      });
  } else {
    console.warn('⚠️ Este navegador no soporta Service Workers.');
  }

});
