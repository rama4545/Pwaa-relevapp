// js/ocr.js
const botonOCR           = document.getElementById('botonOCR');
const textoReconocido    = document.getElementById('textoReconocido');
const placeholderTexto   = document.getElementById('placeholderTexto');
const barraProgreso      = document.getElementById('barraProgreso');
const contenedorProgreso = document.getElementById('contenedorProgreso');
const textoProgreso      = document.getElementById('textoProgreso');

botonOCR.addEventListener('click', () => {
  const imagen = obtenerImagenSeleccionada();
  if (!imagen) {
    alert('Primero capturá una imagen.');
    return;
  }
  procesarOCR(imagen);
});

async function procesarOCR(imagen) {
  contenedorProgreso.style.display = 'block';
  textoProgreso.style.display = 'block';
  textoProgreso.textContent = 'Preparando imagen...';
  barraProgreso.style.width = '0%';
  botonOCR.disabled = true;
  botonOCR.textContent = '⏳ Procesando...';
  textoReconocido.textContent = '';
  placeholderTexto.style.display = 'none';

  try {
    // Corremos Tesseract dos veces: una sobre la imagen original y otra sobre la imagen preprocesada, y nos quedamos con el mejor resultado
    const worker = await Tesseract.createWorker('spa+eng', 1, {
      logger: (progreso) => actualizarProgreso(progreso)
    });

    await worker.setParameters({
      tessedit_pageseg_mode: '3' 
    });

    // Pasada 1: imagen original 
    textoProgreso.textContent = 'Analizando imagen original...';
    const resultado1 = await worker.recognize(imagen);
    const texto1 = limpiarTexto(resultado1.data.text);

    // Pasada 2: imagen preprocesada 
    textoProgreso.textContent = 'Analizando con preprocesamiento...';
    const imagenProcesada = await preprocesarImagen(imagen);
    const resultado2 = await worker.recognize(imagenProcesada);
    const texto2 = limpiarTexto(resultado2.data.text);

    await worker.terminate();

    // Nos quedamos con el resultado que tenga más texto útil
    const textoFinal = texto1.length >= texto2.length ? texto1 : texto2;

    if (textoFinal.length > 0) {
      textoReconocido.textContent = textoFinal;
      document.getElementById('btnCopiar').disabled = false;
    } else {
      textoReconocido.textContent = '⚠️ No se detectó texto. Intentá con mejor iluminación o acercate más al texto.';
    }

  } catch (error) {
    console.error('Error en OCR:', error);
    textoReconocido.textContent = '❌ Error al procesar la imagen. Intentá de nuevo.';
  } finally {
    contenedorProgreso.style.display = 'none';
    textoProgreso.style.display = 'none';
    botonOCR.disabled = false;
    botonOCR.textContent = '🔎 Extraer Texto';
  }
}

// Preprocesa la imagen: escala de grises con umbral adaptativo
// Detecta si el fondo es claro o oscuro y ajusta a partir de eso
function preprocesarImagen(archivo) {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(archivo);

    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width  = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);

      const datosImagen = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const datos = datosImagen.data;

      // Calculamos el brillo promedio de la imagen para saber si el fondo es claro (texto oscuro) o oscuro (texto claro)
      let sumaGris = 0;
      const totalPixeles = datos.length / 4;

      for (let i = 0; i < datos.length; i += 4) {
        sumaGris += 0.299 * datos[i] + 0.587 * datos[i+1] + 0.114 * datos[i+2];
      }

      const brilloPromedio = sumaGris / totalPixeles;

      // Si el brillo promedio es alto,fondo claro
      // Si el brillo promedio es bajo,fondo oscuro
      const fondoClaro = brilloPromedio > 127;

      for (let i = 0; i < datos.length; i += 4) {
        const gris = 0.299 * datos[i] + 0.587 * datos[i+1] + 0.114 * datos[i+2];

        let valor;
        if (fondoClaro) {
          // Fondo claro: pixeles oscuros son texto 
          valor = gris < 140 ? 0 : 255;
        } else {
          // Fondo oscuro: pixeles claros son texto 
          valor = gris > 115 ? 0 : 255;
        }

        datos[i] = datos[i+1] = datos[i+2] = valor;
      }

      ctx.putImageData(datosImagen, 0, 0);

      canvas.toBlob((blob) => {
        URL.revokeObjectURL(url);
        resolve(blob);
      }, 'image/png');
    };

    img.src = url;
  });
}

function limpiarTexto(textoRaw) {
  const lineas = textoRaw.split('\n');

  const lineasLimpias = lineas.filter((linea) => {
    const limpia = linea.trim();
    if (limpia.length === 0) return false;

    // Necesita al menos 2 letras o números reales para no ser ruido
    const letrasYNumeros = limpia.replace(/[^a-zA-ZáéíóúüñÁÉÍÓÚÜÑ0-9]/g, '');
    return letrasYNumeros.length >= 2;
  });

  return lineasLimpias.join('\n').trim();
}

function actualizarProgreso(progreso) {
  if (progreso.status === 'recognizing text') {
    const porcentaje = Math.round(progreso.progress * 100);
    barraProgreso.style.width = porcentaje + '%';
    textoProgreso.textContent = `Reconociendo texto... ${porcentaje}%`;
  } else {
    textoProgreso.textContent = progreso.status;
  }
}
