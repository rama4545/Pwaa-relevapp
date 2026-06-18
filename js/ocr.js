// ==============================================
// js/ocr.js — Módulo de reconocimiento de texto (OCR)
// Usa Tesseract.js con preprocesamiento de imagen
// ==============================================

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
    // Preprocesamos la imagen antes de dársela a Tesseract
    // Esto mejora mucho la precisión: convierte a blanco/negro con alto contraste
    const imagenProcesada = await preprocesarImagen(imagen);

    const worker = await Tesseract.createWorker('spa+eng', 1, {
      logger: (progreso) => actualizarProgreso(progreso)
    });

    // PSM 6 = trata la imagen como un bloque de texto uniforme
    // Ayuda a ignorar elementos visuales que no son texto
    await worker.setParameters({
      tessedit_pageseg_mode: '6'
    });

    const resultado = await worker.recognize(imagenProcesada);

    // Limpiamos el texto: sacamos líneas que son solo símbolos o basura
    const texto = limpiarTexto(resultado.data.text);

    if (texto.length > 0) {
      textoReconocido.textContent = texto;
      document.getElementById('btnCopiar').disabled = false;
    } else {
      textoReconocido.textContent = '⚠️ No se detectó texto. Intentá con mejor iluminación o una imagen más nítida.';
    }

    await worker.terminate();

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

// Convierte la imagen a escala de grises con umbral (binarización)
// Resultado: fondo blanco, texto negro → Tesseract trabaja mucho mejor así
function preprocesarImagen(archivo) {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(archivo);

    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width  = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');

      // Dibujamos la imagen original
      ctx.drawImage(img, 0, 0);

      // Obtenemos los píxeles
      const datosImagen = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const datos = datosImagen.data;

      for (let i = 0; i < datos.length; i += 4) {
        const r = datos[i];
        const g = datos[i + 1];
        const b = datos[i + 2];

        // Fórmula estándar para convertir RGB a escala de grises
        const gris = 0.299 * r + 0.587 * g + 0.114 * b;

        // Umbral adaptativo: píxeles oscuros → negro, claros → blanco
        // Umbral 140: si el gris es menor a 140, es texto (negro)
        const valor = gris < 140 ? 0 : 255;

        datos[i]     = valor; // R
        datos[i + 1] = valor; // G
        datos[i + 2] = valor; // B
        // datos[i + 3] es el alpha, no lo tocamos
      }

      ctx.putImageData(datosImagen, 0, 0);

      // Convertimos el canvas a Blob para pasárselo a Tesseract
      canvas.toBlob((blob) => {
        URL.revokeObjectURL(url); // Liberamos memoria
        resolve(blob);
      }, 'image/png');
    };

    img.src = url;
  });
}

// Filtra líneas del texto reconocido que son basura (símbolos solos, líneas vacías, etc.)
function limpiarTexto(textoRaw) {
  const lineas = textoRaw.split('\n');

  const lineasLimpias = lineas.filter((linea) => {
    const limpia = linea.trim();

    // Descartamos líneas vacías
    if (limpia.length === 0) return false;

    // Contamos cuántos caracteres son letras o números reales
    const letrasYNumeros = limpia.replace(/[^a-zA-ZáéíóúüñÁÉÍÓÚÜÑ0-9]/g, '');

    // Si la línea tiene menos de 2 letras/números reales, probablemente es ruido
    if (letrasYNumeros.length < 2) return false;

    return true;
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
