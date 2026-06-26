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
    // Bug 1 fix: createWorker sin parámetros de idioma en el constructor,
    // luego loadLanguage + initialize explícitos (compatible con todas las versiones de Tesseract.js)
    const worker = await Tesseract.createWorker({ logger: (p) => actualizarProgreso(p) });
    await worker.loadLanguage('spa+eng');
    await worker.initialize('spa+eng');

    const psms = ['6', '11', '13'];
    const variantes = await generarVariantes(imagen);
    const candidatos = [];
    let pasoTotal = 0;
    const totalPasos = psms.length * variantes.length;

    for (const psm of psms) {
      await worker.setParameters({ tessedit_pageseg_mode: psm });
      for (const { blob, nombre } of variantes) {
        if (!blob) { pasoTotal++; continue; } // Bug 4 fix: saltar blobs nulos
        textoProgreso.textContent = `Analizando (PSM ${psm} / ${nombre})...`;
        const res = await worker.recognize(blob);
        const texto = limpiarTexto(res.data.text);
        const confianza = res.data.confidence || 0;
        // Bug 2 fix: score combinado para que un texto vacío con alta confianza no gane
        const score = confianza * 0.8 + texto.length * 0.2;
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

// Bug 3 fix: usar Image() + canvas en vez de createImageBitmap() — máxima compatibilidad Android/Chrome
function cargarImagenEnCanvas(archivo, escala) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(archivo);
    img.onload = () => {
      const w = img.width * escala;
      const h = img.height * escala;
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve(canvas);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo cargar la imagen')); };
    img.src = url;
  });
}

// Bug 4 fix: blobDesdeCanvas rechaza si toBlob devuelve null
function blobDesdeCanvas(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) { reject(new Error('toBlob devolvió null')); return; }
      resolve(blob);
    }, 'image/png');
  });
}

async function generarVariantes(archivo) {
  // Determinar escala con un canvas temporal
  const canvasTmp = await cargarImagenEnCanvas(archivo, 1);
  const w0 = canvasTmp.width;
  const escala = w0 < 1200 ? 3 : w0 < 2000 ? 2 : 1;

  const canvas = await cargarImagenEnCanvas(archivo, escala);
  const w = canvas.width, h = canvas.height;
  const ctx = canvas.getContext('2d');
  const imgData = ctx.getImageData(0, 0, w, h);
  const d = imgData.data;

  // Extraer canales
  const gris  = new Uint8ClampedArray(w * h);
  const rojo  = new Uint8ClampedArray(w * h);
  const verde = new Uint8ClampedArray(w * h);
  const azul  = new Uint8ClampedArray(w * h);
  const hsvV  = new Uint8ClampedArray(w * h);
  const hslL  = new Uint8ClampedArray(w * h);

  for (let i = 0, j = 0; i < d.length; i += 4, j++) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    rojo[j]  = r;
    verde[j] = g;
    azul[j]  = b;
    gris[j]  = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    hsvV[j]  = Math.max(r, g, b);
    hslL[j]  = Math.round((Math.max(r, g, b) + Math.min(r, g, b)) / 2);
  }

  const brilloPromedio = gris.reduce((a, v) => a + v, 0) / gris.length;
  const fondoClaro = brilloPromedio > 127;

  const variantes = [
    { canal: null,  nombre: 'original' },
    { canal: gris,  nombre: 'grises' },
    { canal: rojo,  nombre: 'canal-rojo' },
    { canal: verde, nombre: 'canal-verde' },
    { canal: azul,  nombre: 'canal-azul' },
    { canal: hsvV,  nombre: 'hsv-v' },
    { canal: hslL,  nombre: 'hsl-l' },
  ];

  const resultado = [];

  // Original escalada
  try { resultado.push({ blob: await blobDesdeCanvas(canvas), nombre: 'original' }); }
  catch (_) { resultado.push({ blob: null, nombre: 'original' }); }

  // Canales de color directos
  for (const { canal, nombre } of variantes.slice(1)) {
    try { resultado.push({ blob: await canalABlob(canal, w, h), nombre }); }
    catch (_) { resultado.push({ blob: null, nombre }); }
  }

  // Variantes binarizadas (sobre escala de grises)
  for (const modo of ['alto-contraste', 'otsu', 'nitidez', 'invertida']) {
    try { resultado.push({ blob: await binarizar(gris, w, h, modo, fondoClaro), nombre: modo }); }
    catch (_) { resultado.push({ blob: null, nombre: modo }); }
  }

  return resultado;
}

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
      for (let ky = -1; ky <= 1; ky++)
        for (let kx = -1; kx <= 1; kx++)
          v.push(gris[Math.min(Math.max(y + ky, 0), h - 1) * w + Math.min(Math.max(x + kx, 0), w - 1)]);
      v.sort((a, b) => a - b);
      sal[y * w + x] = v[4];
    }
  }
  return sal;
}

async function binarizar(grisOriginal, w, h, modo, fondoClaro) {
  let gris = new Uint8ClampedArray(grisOriginal);
  if (modo === 'nitidez') { gris = reducirRuido(gris, w, h); gris = aplicarNitidez(gris, w, h); }

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
    if (modo === 'invertida') v = gris[i] > umbral ? 0 : 255;
    else if (!fondoClaro)     v = gris[i] > umbral ? 255 : 0;
    else                      v = gris[i] < umbral ? 0 : 255;
    rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = v;
    rgba[i * 4 + 3] = 255;
  }
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  canvas.getContext('2d').putImageData(new ImageData(rgba, w, h), 0, 0);
  return blobDesdeCanvas(canvas);
}

function limpiarTexto(textoRaw) {
  return textoRaw
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && l.replace(/[^a-zA-ZáéíóúüñÁÉÍÓÚÜÑ0-9]/g, '').length >= 2)
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
