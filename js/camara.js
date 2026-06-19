// Guardamos la imagen seleccionada para que otros módulos puedan usarla
let imagenSeleccionada = null;

// Función para obtener la imagen desde otros módulos (como ocr.js)
function obtenerImagenSeleccionada() {
  return imagenSeleccionada;
}

// Referencias a los elementos del HTML
const botonCapturar    = document.getElementById('botonCapturar');
const inputCamara      = document.getElementById('inputCamara');
const contenedorImagen = document.getElementById('contenedorImagen');
const vistaPrevia      = document.getElementById('vistaPrevia');

// Al hacer clic en el botón, activamos el input oculto
botonCapturar.addEventListener('click', () => {
  inputCamara.click();
});

// Cuando el usuario elige o toma una foto
inputCamara.addEventListener('change', (evento) => {
  const archivo = evento.target.files[0];

  if (!archivo || !archivo.type.startsWith('image/')) {
    alert('Por favor seleccioná una imagen válida.');
    return;
  }

  // Guardamos la referencia para que ocr.js pueda usarla
  imagenSeleccionada = archivo;

  // Mostramos la vista previa con FileReader
  const lector = new FileReader();
  lector.onload = (e) => {
    vistaPrevia.src = e.target.result;
    vistaPrevia.style.display = 'block';

    // Ocultamos el texto "aparecerá aquí"
    const placeholder = contenedorImagen.querySelector('.texto-placeholder');
    if (placeholder) placeholder.style.display = 'none';

    // Habilitamos el botón de OCR
    document.getElementById('botonOCR').disabled = false;

    // Limpiamos resultados anteriores
    document.getElementById('textoReconocido').textContent = '';
    document.getElementById('btnCopiar').disabled = true;
    document.getElementById('mensajeCopiado').style.display = 'none';
    document.getElementById('placeholderTexto').style.display = 'block';
  };

  lector.readAsDataURL(archivo);
});
