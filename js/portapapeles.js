// ==============================================
// js/portapapeles.js — Módulo de copia al portapapeles
// ==============================================

const btnCopiar      = document.getElementById('btnCopiar');
const mensajeCopiado = document.getElementById('mensajeCopiado');

btnCopiar.addEventListener('click', async () => {
  const texto = document.getElementById('textoReconocido').textContent;

  // No copiamos si es un mensaje de error o está vacío
  if (!texto || texto.startsWith('⚠️') || texto.startsWith('❌')) {
    alert('No hay texto válido para copiar.');
    return;
  }

  try {
    // Método moderno — requiere HTTPS o localhost
    await navigator.clipboard.writeText(texto);
    mostrarMensajeCopiado();
  } catch (error) {
    // Método de respaldo para navegadores más viejos
    copiarTextoAntiguo(texto);
  }
});

// Fallback: crea un textarea invisible, selecciona el texto y ejecuta el comando copy
function copiarTextoAntiguo(texto) {
  const area = document.createElement('textarea');
  area.value = texto;
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();
  document.execCommand('copy');
  document.body.removeChild(area);
  mostrarMensajeCopiado();
}

// Muestra el mensaje verde por 2 segundos y luego lo oculta
function mostrarMensajeCopiado() {
  mensajeCopiado.style.display = 'block';
  setTimeout(() => {
    mensajeCopiado.style.display = 'none';
  }, 2000);
}
