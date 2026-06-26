// js/ocr.js
const botonOCR           = document.getElementById('botonOCR');
const textoReconocido    = document.getElementById('textoReconocido');
const placeholderTexto   = document.getElementById('placeholderTexto');
const barraProgreso      = document.getElementById('barraProgreso');
const contenedorProgreso = document.getElementById('contenedorProgreso');
const textoProgreso      = document.getElementById('textoProgreso');

botonOCR.addEventListener('click', () => {
  const imagen = obtenerImagenSeleccionada();
  if (!imagen) { alert('Primero capturá una imagen.'); return; }
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
    const worker = await Tesseract.createWorker('spa+eng', 1, {
      logger: (p) => actualizarProgreso(p)
    });

    // PSM modes a probar: 6 = bloque uniforme, 11 = texto disperso, 13 = línea sin OSD
    const psms = ['6', '11', '13'];
    const variantes = await generarVariantes(imagen);
    const candidatos = [];
    let pasoTotal = 0;
    const totalPasos = psms.length * variantes.length;

    for (const psm of psms) {
      await worker.setParameters({ tessedit_pageseg_mode: psm });
      for (const { blob, nombre } of variantes) {
        textoProgreso.textContent = `Analizando (PSM ${psm} / ${nombre})...`;
        const res = await worker.recognize(blob);
        const texto = limpiarTexto(res.data.text);
        const confianza = res.data.confidence || 0;
        const score = confianza * 0.7 + texto.length * 0.3;
        candidatos.push({ texto, confianza, score, psm, nombre });
        pasoTotal++;
        barraProgreso.style.width = Math.round((pasoTotal / totalPasos) * 100) + '%';
      }
    }

    await worker.terminate();

    candidatos.sort((a, b) => b.score - a.score);
    const mejor = candidatos[0];

    if (mejor && mejor.texto.length > 0) {
      textoReconocido.textContent = mejor.texto;
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

// Genera múltiples variantes de la imagen con distintos preprocesamientos
async function generarVariantes(archivo) {
  const bitmapOriginal = await createImageBitmap(archivo);
  const escala = bitmapOriginal.width < 1200 ? 3 : bitmapOriginal.width < 2000 ? 2 : 1;
  const w = bitmapOriginal.width * escala;
  const h = bitmapOriginal.height * escala;

  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmapOriginal, 0, 0, w, h);

  const imgData = ctx.getImageData(0, 0, w, h);
  const gris = toGrayscale(imgData.data, w, h);
  const brilloPromedio = gris.reduce((a, b) => a + b, 0) / gris.length;
  const fondoClaro = brilloPromedio > 127;

  return [
    { blob: await blobDesdeCanvas(canvas), nombre: 'original-escalada' },
    { blob: await procesarConFiltros(gris, w, h, 'alto-contraste', fondoClaro), nombre: 'alto-contraste' },
    { blob: await procesarConFiltros(gris, w, h, 'otsu', fondoClaro), nombre: 'binarizacion-otsu' },
    { blob: await procesarConFiltros(gris, w, h, 'nitidez', fondoClaro), nombre: 'nitidez' },
    { blob: await procesarConFiltros(gris, w, h, 'invertida', fondoClaro), nombre: 'invertida' },
  ];
}

function toGrayscale(datos, w, h) {
  const gris = new Uint8ClampedArray(w * h);
  for (let i = 0, j = 0; i < datos.length; i += 4, j++) {
    gris[j] = Math.round(0.299 * datos[i] + 0.587 * datos[i + 1] + 0.114 * datos[i + 2]);
  }
  return gris;
}

function calcularUmbralOtsu(gris) {
  const histograma = new Array(256).fill(0);
  for (const v of gris) histograma[v]++;
  const total = gris.length;
  let suma = 0;
  for (let i = 0; i < 256; i++) suma += i * histograma[i];
  let sumaBg = 0, wBg = 0, wFg = 0, varMax = 0, umbral = 0;
  for (let t = 0; t < 256; t++) {
    wBg += histograma[t];
    if (wBg === 0) continue;
    wFg = total - wBg;
    if (wFg === 0) break;
    sumaBg += t * histograma[t];
    const mBg = sumaBg / wBg;
    const mFg = (suma - sumaBg) / wFg;
    const varEntre = wBg * wFg * (mBg - mFg) ** 2;
    if (varEntre > varMax) { varMax = varEntre; umbral = t; }
  }
  return umbral;
}

function aplicarNitidez(gris, w, h) {
  // Kernel de sharpen 3×3
  const kernel = [0, -1, 0, -1, 5, -1, 0, -1, 0];
  const salida = new Uint8ClampedArray(gris.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let suma = 0;
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const ny = Math.min(Math.max(y + ky, 0), h - 1);
          const nx = Math.min(Math.max(x + kx, 0), w - 1);
          suma += gris[ny * w + nx] * kernel[(ky + 1) * 3 + (kx + 1)];
        }
      }
      salida[y * w + x] = Math.min(Math.max(suma, 0), 255);
    }
  }
  return salida;
}

function reducirRuido(gris, w, h) {
  // Mediana 3×3 simplificada
  const salida = new Uint8ClampedArray(gris.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const vecinos = [];
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const ny = Math.min(Math.max(y + ky, 0), h - 1);
          const nx = Math.min(Math.max(x + kx, 0), w - 1);
          vecinos.push(gris[ny * w + nx]);
        }
      }
      vecinos.sort((a, b) => a - b);
      salida[y * w + x] = vecinos[4];
    }
  }
  return salida;
}

async function procesarConFiltros(grisOriginal, w, h, modo, fondoClaro) {
  let gris = new Uint8ClampedArray(grisOriginal);

  if (modo === 'nitidez') {
    gris = reducirRuido(gris, w, h);
    gris = aplicarNitidez(gris, w, h);
  }

  // Estiramiento de contraste CLAHE simple
  let min = 255, max = 0;
  for (const v of gris) { if (v < min) min = v; if (v > max) max = v; }
  if (max > min) {
    for (let i = 0; i < gris.length; i++) {
      gris[i] = Math.round(((gris[i] - min) / (max - min)) * 255);
    }
  }

  let umbral;
  if (modo === 'otsu' || modo === 'nitidez') {
    umbral = calcularUmbralOtsu(gris);
  } else if (modo === 'alto-contraste') {
    umbral = fondoClaro ? 150 : 105;
  } else {
    umbral = 127;
  }

  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < gris.length; i++) {
    let valor;
    if (modo === 'invertida') {
      valor = gris[i] > umbral ? 0 : 255;
    } else if (!fondoClaro) {
      valor = gris[i] > umbral ? 255 : 0;
    } else {
      valor = gris[i] < umbral ? 0 : 255;
    }
    rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = valor;
    rgba[i * 4 + 3] = 255;
  }

  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  canvas.getContext('2d').putImageData(new ImageData(rgba, w, h), 0, 0);
  return blobDesdeCanvas(canvas);
}

function blobDesdeCanvas(canvas) {
  return new Promise((res) => canvas.toBlob(res, 'image/png'));
}

function limpiarTexto(textoRaw) {
  return textoRaw
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => {
      if (l.length === 0) return false;
      const alfanum = l.replace(/[^a-zA-ZáéíóúüñÁÉÍÓÚÜÑ0-9]/g, '');
      return alfanum.length >= 2;
    })
    .join('\n')
    .trim();
}

function actualizarProgreso(progreso) {
  if (progreso.status === 'recognizing text') {
    const pct = Math.round(progreso.progress * 100);
    barraProgreso.style.width = pct + '%';
    textoProgreso.textContent = `Reconociendo texto... ${pct}%`;
  } else {
    textoProgreso.textContent = progreso.status;
  }
}
