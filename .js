// js/opencv.js
// Detecta regiones de texto en una imagen usando OpenCV.js
// Devuelve un array de { blob, nombre } listo para Tesseract

// Espera a que OpenCV.js esté listo. Se llama una sola vez desde ocr.js.
function esperarOpenCV() {
  return new Promise((resolve) => {
    if (typeof cv !== 'undefined' && cv.Mat) { resolve(); return; }
    const intervalo = setInterval(() => {
      if (typeof cv !== 'undefined' && cv.Mat) { clearInterval(intervalo); resolve(); }
    }, 100);
  });
}

/**
 * Entrada : archivo  — File/Blob original de la imagen capturada
 *           canvasEscalado — canvas ya escalado generado por cargarImagenEnCanvas()
 * Salida  : Array de { blob, nombre }
 *           Si OpenCV falla o no detecta regiones, devuelve array vacío
 *           para que ocr.js use el fallback de generarVariantes()
 */
async function detectarRegionesTexto(archivo, canvasEscalado) {
  try {
    await esperarOpenCV();

    const w = canvasEscalado.width;
    const h = canvasEscalado.height;
    const ctx = canvasEscalado.getContext('2d');
    const imgData = ctx.getImageData(0, 0, w, h);

    // Crear Mat RGBA y convertir a gris
    const src  = cv.matFromImageData(imgData);
    const gris = new cv.Mat();
    cv.cvtColor(src, gris, cv.COLOR_RGBA2GRAY);

    // Gaussian Blur para reducir ruido antes de Canny
    const blur = new cv.Mat();
    const ksize = new cv.Size(5, 5);
    cv.GaussianBlur(gris, blur, ksize, 0);

    // Canny Edge Detection
    const bordes = new cv.Mat();
    cv.Canny(blur, bordes, 50, 150);

    // Dilatación para unir bordes cercanos y formar bloques de texto
    const dilatado = new cv.Mat();
    const kernel = cv.getStructuringElement(
      cv.MORPH_RECT,
      new cv.Size(18, 4)   // más ancho que alto: une letras en líneas horizontales
    );
    cv.dilate(bordes, dilatado, kernel);

    // Detectar contornos
    const contornos = new cv.MatVector();
    const jerarquia = new cv.Mat();
    cv.findContours(dilatado, contornos, jerarquia, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    const regiones = [];
    const areaMinima = (w * h) * 0.001;  // descartar regiones < 0.1% del área total
    const areaMaxima = (w * h) * 0.95;   // descartar regiones que sean casi toda la imagen

    for (let i = 0; i < contornos.size(); i++) {
      const rect = cv.boundingRect(contornos.get(i));

      // Filtros de tamaño
      const area = rect.width * rect.height;
      if (area < areaMinima) continue;
      if (area > areaMaxima) continue;
      if (rect.width < 20 || rect.height < 8) continue;

      // Filtro de proporción: descartar regiones muy altas y angostas (probablemente no son texto)
      const proporcion = rect.width / rect.height;
      if (proporcion < 0.5) continue;

      regiones.push(rect);
    }

    // Liberar memoria OpenCV
    src.delete(); gris.delete(); blur.delete();
    bordes.delete(); dilatado.delete(); kernel.delete();
    contornos.delete(); jerarquia.delete();

    if (regiones.length === 0) return [];

    // Fusionar rectángulos que se solapan o están muy cerca (agrupa líneas del mismo bloque)
    const fusionados = fusionarRectangulos(regiones, 20);

    // Recortar cada región, escalarla y convertirla a blob
    const escalaRegion = 2; // cada recorte se escala 2x para Tesseract
    const resultado = [];

    for (let i = 0; i < fusionados.length; i++) {
      const r = fusionados[i];

      // Margen de seguridad alrededor de cada región
      const margen = 8;
      const x = Math.max(0, r.x - margen);
      const y = Math.max(0, r.y - margen);
      const rw = Math.min(w - x, r.width  + margen * 2);
      const rh = Math.min(h - y, r.height + margen * 2);

      // Recortar del canvas escalado original (color completo, sin filtros)
      const canvasRecorte = document.createElement('canvas');
      canvasRecorte.width  = rw * escalaRegion;
      canvasRecorte.height = rh * escalaRegion;
      const ctxR = canvasRecorte.getContext('2d');
      ctxR.imageSmoothingEnabled = true;
      ctxR.imageSmoothingQuality = 'high';
      ctxR.drawImage(canvasEscalado, x, y, rw, rh, 0, 0, rw * escalaRegion, rh * escalaRegion);

      try {
        const blob = await blobDesdeCanvas(canvasRecorte);
        resultado.push({ blob, nombre: `region-${i + 1}` });
      } catch (_) {
        // blob nulo: ignorar esta región
      }
    }

    return resultado;

  } catch (err) {
    console.warn('textDetector: OpenCV falló, usando fallback.', err);
    return [];
  }
}

// Fusiona rectángulos que se solapan o cuya distancia horizontal/vertical es menor a `margen`
function fusionarRectangulos(rects, margen) {
  const usados = new Array(rects.length).fill(false);
  const grupos = [];

  for (let i = 0; i < rects.length; i++) {
    if (usados[i]) continue;
    let grupo = { ...rects[i] };
    usados[i] = true;
    let cambio = true;
    while (cambio) {
      cambio = false;
      for (let j = 0; j < rects.length; j++) {
        if (usados[j]) continue;
        if (rectsCercanos(grupo, rects[j], margen)) {
          grupo = unirRect(grupo, rects[j]);
          usados[j] = true;
          cambio = true;
        }
      }
    }
    grupos.push(grupo);
  }
  return grupos;
}

function rectsCercanos(a, b, margen) {
  const ax2 = a.x + a.width,  ay2 = a.y + a.height;
  const bx2 = b.x + b.width,  by2 = b.y + b.height;
  return !(ax2 + margen < b.x || bx2 + margen < a.x ||
           ay2 + margen < b.y || by2 + margen < a.y);
}

function unirRect(a, b) {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, width: Math.max(a.x + a.width, b.x + b.width) - x,
                  height: Math.max(a.y + a.height, b.y + b.height) - y };
}
