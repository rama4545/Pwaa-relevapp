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
        candidatos.push({ texto, confianza, psm, nombre });
        pasoTotal++;
        barraProgreso.style.width = Math.round((pasoTotal / totalPasos) * 100) + '%';
      }
    }

    await worker.terminate();

    candidatos.sort((a, b) => b.confianza - a.confianza);
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

async function generarVariantes(archivo) {
  const bitmap = await createImageBitmap(archivo);
  const escala = bitmap.width < 1200 ? 3 : bitmap.width < 2000 ? 2 : 1;
  const w = bitmap.width * escala;
  const h = bitmap.height * escala;

  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, w, h);

  const imgData = ctx.getImageData(0, 0, w, h);
  const d = imgData.data;

  // Extraer canales crudos
  const rojo  = new Uint8ClampedArray(w * h);
  const verde = new Uint8ClampedArray(w * h);
  const azul  = new Uint8ClampedArray(w * h);
  const gris  = new Uint8ClampedArray(w * h);
  const hsvV  = new Uint8ClampedArray(w * h);
  const hslL  = new Uint8ClampedArray(w * h);

  for (let i = 0, j = 0; i < d.length; i += 4, j++) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    rojo[j]  = r;
    verde[j] = g;
    azul[j]  = b;
    gris[j]  = Math.round(0.299 * r + 0.587 * g + 0.114 * b);

    // HSV: canal V = max(r,g,b)
    hsvV[j] = Math.max(r, g, b);

    // HSL: canal L = (max+min)/2
    hslL[j] = Math.round((Math.max(r, g, b) + Math.min(r, g, b)) / 2);
  }

  const brilloPromedio = gris.reduce((a, b) => a + b, 0) / gris.length;
  const fondoClaro = brilloPromedio > 127;

  const canales = { rojo, verde, azul, gris, hsvV, hslL };

  return [
    { blob: await blobDesdeCanvas(canvas),                                      nombre: 'original' },
    { blob: await canalABlob(gris,  w, h),                                      nombre: 'grises' },
    { blob: await canalABlob(rojo,  w, h),                                      nombre: 'canal-rojo' },
    { blob: await canalABlob(verde, w, h),                                      nombre: 'canal-verde' },
    { blob: await canalABlob(azul,  w, h),                                      nombre: 'canal-azul' },
    { blob: await canalABlob(hsvV,  w, h),                                      nombre: 'hsv-v' },
    { blob: await canalABlob(hslL,  w, h),                                      nombre: 'hsl-l' },
    { blob: await binarizar(gris,   w, h, 'alto-contraste', fondoClaro),        nombre: 'alto-contraste' },
    { blob: await binarizar(gris,   w, h, 'otsu',           fondoClaro),        nombre: 'otsu' },
    { blob: await binarizar(gris,   w, h, 'nitidez',        fondoClaro),        nombre: 'nitidez' },
    { blob: await binarizar(gris,   w, h, 'invertida',      fondoClaro),        nombre: 'invertida' },
  ];
}

// Convierte un canal monocromático a blob PNG en escala de grises
async function canalABlob(canal, w, h) {
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < canal.length; i++) {
    rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = canal[i];
    rgba[i * 4 + 3] = 255;
  }
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  canvas.getContext('2d').putImageData(new ImageData(rgba, w, h), 0, 0);
  return blobDesdeCanvas(canvas);
}

function calcularUmbralOtsu(gris) {
  const hist = new Array(256).fill(0);
  for (const v of gris) hist[v]++;
  const total = gris.length;
  let suma = 0;
  for (let i = 0; i < 256; i++) suma += i * hist[i];
  let sumaBg = 0, wBg = 0, varMax = 0, umbral = 0;
  for (let t = 0; t < 256; t++) {
    wBg += hist[t];
    if (!wBg) continue;
    const wFg = total - wBg;
    if (!wFg) break;
    sumaBg += t * hist[t];
    const diff = sumaBg / wBg - (suma - sumaBg) / wFg;
    const varEntre = wBg * wFg * diff * diff;
    if (varEntre > varMax) { varMax = varEntre; umbral = t; }
  }
  return umbral;
}

function aplicarNitidez(gris, w, h) {
  const kernel = [0, -1, 0, -1, 5, -1, 0, -1, 0];
  const sal = new Uint8ClampedArray(gris.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const ny = Math.min(Math.max(y + ky, 0), h - 1);
          const nx = Math.min(Math.max(x + kx, 0), w - 1);
          s += gris[ny * w + nx] * kernel[(ky + 1) * 3 + (kx + 1)];
        }
      }
      sal[y * w + x] = Math.min(Math.max(s, 0), 255);
    }
  }
  return sal;
}

function reducirRuido(gris, w, h) {
  const sal = new Uint8ClampedArray(gris.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = [];
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          v.push(gris[Math.min(Math.max(y + ky, 0), h - 1) * w + Math.min(Math.max(x + kx, 0), w - 1)]);
        }
      }
      v.sort((a, b) => a - b);
      sal[y * w + x] = v[4];
    }
  }
  return sal;
}

async function binarizar(grisOriginal, w, h, modo, fondoClaro) {
  let gris = new Uint8ClampedArray(grisOriginal);

  if (modo === 'nitidez') {
    gris = reducirRuido(gris, w, h);
    gris = aplicarNitidez(gris, w, h);
  }

  // Estiramiento de contraste
  let min = 255, max = 0;
  for (const v of gris) { if (v < min) min = v; if (v > max) max = v; }
  if (max > min) for (let i = 0; i < gris.length; i++)
    gris[i] = Math.round(((gris[i] - min) / (max - min)) * 255);

  const umbral = (modo === 'otsu' || modo === 'nitidez')
    ? calcularUmbralOtsu(gris)
    : (modo === 'alto-contraste' ? (fondoClaro ? 150 : 105) : 127);

  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < gris.length; i++) {
    let v;
    if (modo === 'invertida')    v = gris[i] > umbral ? 0 : 255;
    else if (!fondoClaro)        v = gris[i] > umbral ? 255 : 0;
    else                         v = gris[i] < umbral ? 0 : 255;
    rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = v;
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
      if (!l.length) return false;
      return l.replace(/[^a-zA-ZáéíóúüñÁÉÍÓÚÜÑ0-9]/g, '').length >= 2;
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
