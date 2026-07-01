/* ==========================================================================
   PIX FORCE ORTHOPHOTO VIEWER - APPLICATION LOGIC
   ========================================================================== */

// Global Application State
const AppState = {
    map: null,
    orthophotoLayer: null,
    baseLayers: {},
    activeBaseMap: 'satellite',
    
    // File metadata
    fileName: '',
    fileSize: '',
    fileType: '',
    dimensions: '',
    isGeoreferenced: false,
    geotagBounds: null, // Leaflet LatLngBounds (geographic) or coordinates array
    crsName: 'EPSG:4326 (WGS 84)',
    
    // Interactive adjustments
    filters: {
        brightness: 100,
        contrast: 100,
        saturation: 100
    },
    opacity: 100,
    
    // Measurement tools
    measurementMode: 'none', // 'none', 'distance', 'area'
    measurementPoints: [],   // Array of L.LatLng
    measurementMarkers: [],  // Array of L.Marker
    measurementLine: null,   // L.Polyline (drawing preview or finalized path)
    measurementPolygon: null,// L.Polygon
    tempLine: null,          // L.Polyline for cursor follow effect
    tempPolygon: null,       // L.Polygon for cursor follow effect
    
    // Scale for non-georeferenced images (pixel to meters coefficient)
    pixelToMetersScale: 0.05 // default 5cm per pixel (typical drone orthophoto GSD)
};

// Initialize on page load
document.addEventListener("DOMContentLoaded", () => {
    // Initialize Lucide icons
    lucide.createIcons();
    
    // Set up all event listeners
    setupEventListeners();
});

/* ==========================================================================
   EVENT LISTENERS
   ========================================================================== */
function setupEventListeners() {
    // 1. Upload Page Elements
    const dropzone = document.getElementById("dropzone");
    const fileInput = document.getElementById("file-input");
    const urlForm = document.getElementById("url-form");
    const urlInput = document.getElementById("url-input");
    
    // Drag and drop event handlers
    ['dragenter', 'dragover'].forEach(eventName => {
        dropzone.addEventListener(eventName, (e) => {
            e.preventDefault();
            dropzone.classList.add('dragover');
        }, false);
    });
    
    ['dragleave', 'drop'].forEach(eventName => {
        dropzone.addEventListener(eventName, (e) => {
            e.preventDefault();
            dropzone.classList.remove('dragover');
        }, false);
    });
    
    dropzone.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        const files = dt.files;
        if (files.length > 0) {
            handleLocalFile(files[0]);
        }
    });
    
    fileInput.addEventListener('change', (e) => {
        if (fileInput.files.length > 0) {
            handleLocalFile(fileInput.files[0]);
        }
    });
    
    // Listener click no dropzone removido para evitar duplo disparo do input file.
    // O input já ocupa a área inteira com CSS, então ele captura o clique nativamente.
    
    // URL Form Submission
    urlForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const url = urlInput.value.trim();
        if (url) {
            handleExternalUrl(url);
        }
    });
    
    // Project file button
    document.getElementById("btn-load-project-ortho").addEventListener('click', loadProjectOrtho);
    
    // Demo Buttons
    document.getElementById("btn-demo-ortho").addEventListener('click', loadDemoOrtho);
    document.getElementById("btn-demo-geotiff").addEventListener('click', loadDemoGeoTIFF);
    
    // 2. Viewer Page Elements
    // Back button
    document.getElementById("btn-back").addEventListener('click', exitViewer);
    
    // Fullscreen button
    document.getElementById("btn-fullscreen").addEventListener('click', () => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(err => console.error("Erro fullscreen:", err));
        } else {
            if (document.exitFullscreen) document.exitFullscreen();
        }
    });
    
    // Opacity Slider
    const opacitySlider = document.getElementById("opacity-slider");
    const opacityVal = document.getElementById("opacity-value");
    opacitySlider.addEventListener('input', (e) => {
        const val = e.target.value;
        opacityVal.textContent = `${val}%`;
        AppState.opacity = val;
        updateLayerStyles();
    });
    
    // Basemap selector
    const basemapCards = document.querySelectorAll(".basemap-card");
    basemapCards.forEach(card => {
        card.addEventListener('click', (e) => {
            basemapCards.forEach(c => c.classList.remove('active'));
            const cardEl = e.currentTarget;
            cardEl.classList.add('active');
            
            const basemapType = cardEl.getAttribute('data-basemap');
            setBasemap(basemapType);
        });
    });
    
    // Image Adjustment Sliders
    const brightnessSlider = document.getElementById("brightness-slider");
    const brightnessVal = document.getElementById("brightness-value");
    brightnessSlider.addEventListener('input', (e) => {
        AppState.filters.brightness = e.target.value;
        brightnessVal.textContent = `${e.target.value}%`;
        updateLayerStyles();
    });
    
    const contrastSlider = document.getElementById("contrast-slider");
    const contrastVal = document.getElementById("contrast-value");
    contrastSlider.addEventListener('input', (e) => {
        AppState.filters.contrast = e.target.value;
        contrastVal.textContent = `${e.target.value}%`;
        updateLayerStyles();
    });
    
    const saturationSlider = document.getElementById("saturation-slider");
    const saturationVal = document.getElementById("saturation-value");
    saturationSlider.addEventListener('input', (e) => {
        AppState.filters.saturation = e.target.value;
        saturationVal.textContent = `${e.target.value}%`;
        updateLayerStyles();
    });
    
    // Reset Filters Button
    document.getElementById("btn-reset-filters").addEventListener('click', () => {
        AppState.filters = { brightness: 100, contrast: 100, saturation: 100 };
        brightnessSlider.value = 100;
        brightnessVal.textContent = "100%";
        contrastSlider.value = 100;
        contrastVal.textContent = "100%";
        saturationSlider.value = 100;
        saturationVal.textContent = "100%";
        updateLayerStyles();
    });
    
    // Measurement tools
    const btnMeasureDist = document.getElementById("tool-measure-dist");
    const btnMeasureArea = document.getElementById("tool-measure-area");
    
    btnMeasureDist.addEventListener('click', () => toggleMeasurementMode('distance'));
    btnMeasureArea.addEventListener('click', () => toggleMeasurementMode('area'));
    document.getElementById("btn-clear-measurement").addEventListener('click', clearMeasurement);
}

/* ==========================================================================
   NOTIFICATION SYSTEM
   ========================================================================== */
function showToast(message, type = 'error') {
    const toast = document.getElementById("notification");
    toast.className = `notification-toast active ${type}`;
    
    const icon = toast.querySelector(".icon");
    icon.setAttribute('data-lucide', type === 'error' ? 'alert-circle' : 'check-circle');
    lucide.createIcons(); // refresh icons
    
    toast.querySelector(".message").textContent = message;
    
    setTimeout(() => {
        toast.classList.remove('active');
    }, 4500);
}

function showLoading(title, subtitle = '', progress = 0) {
    const overlay = document.getElementById("loading-overlay");
    document.getElementById("loader-title").textContent = title;
    document.getElementById("loader-subtitle").textContent = subtitle;
    
    const progressBar = document.getElementById("loader-progress");
    progressBar.style.width = `${progress}%`;
    
    overlay.classList.add('active');
}

function updateLoadingProgress(progress) {
    const progressBar = document.getElementById("loader-progress");
    progressBar.style.width = `${progress}%`;
}

function hideLoading() {
    document.getElementById("loading-overlay").classList.remove('active');
}

/* ==========================================================================
   URL PARSER (GOOGLE DRIVE / DROPBOX)
   ========================================================================== */
function convertShareLinkToDirect(url) {
    // 1. Google Drive Share Link conversion
    const gDriveMatch = url.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/i) || 
                       url.match(/drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/i);
    if (gDriveMatch && gDriveMatch[1]) {
        return `https://docs.google.com/uc?export=download&id=${gDriveMatch[1]}`;
    }
    
    // 2. Dropbox Share Link conversion
    if (url.includes("dropbox.com")) {
        // Replace www.dropbox.com with dl.dropboxusercontent.com and strip parameters
        let directUrl = url.replace(/www\.dropbox\.com/i, "dl.dropboxusercontent.com");
        // Remove ?dl=0 or replace with raw=1
        directUrl = directUrl.split('?')[0] + "?raw=1";
        return directUrl;
    }
    
    return url;
}

/* ==========================================================================
   LOCAL & REMOTE FILE HANDLING
   ========================================================================== */
async function handleLocalFile(file) {
    AppState.fileName = file.name;
    AppState.fileSize = formatBytes(file.size);
    AppState.fileType = file.type || getFileExtension(file.name).toUpperCase();
    
    showLoading("Processando arquivo local", "Lendo arquivo do disco...", 20);
    
    const ext = getFileExtension(file.name).toLowerCase();
    
    try {
        if (ext === 'tif' || ext === 'tiff') {
            // Parse TIFF/GeoTIFF using geotiff.js
            await parseGeoTIFFBlob(file);
        } else if (['png', 'jpg', 'jpeg'].includes(ext)) {
            // Render standard image locally
            await parseStandardImageBlob(file);
        } else {
            throw new Error("Formato não suportado. Carregue TIFF, GeoTIFF, PNG ou JPG.");
        }
    } catch (err) {
        console.error(err);
        hideLoading();
        showToast(err.message || "Erro ao carregar o arquivo local.");
    }
}

async function handleExternalUrl(url) {
    const directUrl = convertShareLinkToDirect(url);
    AppState.fileName = getUrlFileName(url) || "ortofoto_link.ext";
    AppState.fileSize = "Remoto (N/A)";
    AppState.fileType = getFileExtension(AppState.fileName).toUpperCase() || "Imagem";
    
    showLoading("Buscando URL externa", "Conectando ao servidor...", 30);
    
    const ext = getFileExtension(AppState.fileName).toLowerCase();
    
    try {
        if (ext === 'tif' || ext === 'tiff') {
            // GeoTIFF requires fetching bytes to parse
            const response = await fetch(directUrl);
            if (!response.ok) throw new Error("Erro de rede ao baixar o arquivo.");
            const blob = await response.blob();
            await parseGeoTIFFBlob(blob);
        } else {
            // Standard image can be loaded directly as imageOverlay
            // But we first verify if it's reachable and test CORS (if we need measurements, imageOverlay handles CORS fine unless canvas ops are needed)
            const img = new Image();
            img.crossOrigin = "anonymous";
            img.src = directUrl;
            
            img.onload = () => {
                displayStandardImage(directUrl, img.width, img.height);
                hideLoading();
                showToast("Ortofoto carregada com sucesso!", "success");
            };
            
            img.onerror = () => {
                // If CORS fails but we can load without crossOrigin
                const fallbackImg = new Image();
                fallbackImg.src = directUrl;
                fallbackImg.onload = () => {
                    displayStandardImage(directUrl, fallbackImg.width, fallbackImg.height);
                    hideLoading();
                    showToast("Ortofoto carregada (modo limitado sem metadados externos).", "success");
                };
                fallbackImg.onerror = () => {
                    hideLoading();
                    showToast("Não foi possível carregar a imagem. Verifique o link ou problemas de CORS.");
                };
            };
        }
    } catch (err) {
        console.error(err);
        hideLoading();
        showToast(err.message || "Erro ao baixar ou interpretar a ortofoto.");
    }
}

/* ==========================================================================
   PROJECT FILE LOADER (Fetch + fromBlob for servers without Range Request support)
   ========================================================================== */
async function loadProjectOrtho() {
    const projectFileUrl = 'orto.tif'; // relative URL – served by the HTTP server
    
    AppState.fileName = 'orto.tif';
    AppState.fileSize = 'Calculando...';
    AppState.fileType = 'TIFF (GeoTIFF)';
    
    showLoading('Carregando orto.tif do projeto', 'Iniciando download do arquivo...', 5);
    
    try {
        // Step 1: Download the file with progress tracking
        const response = await fetch(projectFileUrl);
        if (!response.ok) throw new Error(`Erro HTTP ${response.status} ao baixar orto.tif`);
        
        const contentLength = response.headers.get('content-length');
        const totalBytes = contentLength ? parseInt(contentLength) : 0;
        
        if (totalBytes > 0) {
            AppState.fileSize = formatBytes(totalBytes);
        }
        
        // Use ReadableStream to track download progress
        let receivedBytes = 0;
        const reader = response.body.getReader();
        const chunks = [];
        
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            chunks.push(value);
            receivedBytes += value.length;
            
            if (totalBytes > 0) {
                const pct = Math.round((receivedBytes / totalBytes) * 40); // 0-40% for download
                updateLoadingProgress(5 + pct);
                const downloadedMB = (receivedBytes / 1048576).toFixed(1);
                const totalMB = (totalBytes / 1048576).toFixed(1);
                document.getElementById('loader-subtitle').textContent = 
                    `Baixando: ${downloadedMB} MB / ${totalMB} MB (${Math.round(receivedBytes / totalBytes * 100)}%)`;
            } else {
                const downloadedMB = (receivedBytes / 1048576).toFixed(1);
                document.getElementById('loader-subtitle').textContent = 
                    `Baixando: ${downloadedMB} MB...`;
            }
        }
        
        // Combine chunks into a single Blob
        const blob = new Blob(chunks);
        
        updateLoadingProgress(48);
        document.getElementById('loader-subtitle').textContent = 'Lendo metadados do GeoTIFF...';
        
        // Step 2: Parse GeoTIFF from blob
        const tiff = await GeoTIFF.fromBlob(blob);
        
        const imageCount = await tiff.getImageCount();
        let image = await tiff.getImage(0);
        
        let width = image.getWidth();
        let height = image.getHeight();
        let bestIndex = 0;
        
        // Try to find an overview (lower resolution sub-image) that fits browser memory
        for (let i = 0; i < imageCount; i++) {
            const img = await tiff.getImage(i);
            const w = img.getWidth();
            const h = img.getHeight();
            if (w <= 4096 && h <= 4096) {
                image = img;
                width = w;
                height = h;
                bestIndex = i;
                break;
            }
        }
        
        // Prevent canvas crash on huge images without overviews
        const MAX_DIM = 4096;
        let targetWidth = width;
        let targetHeight = height;
        
        if (targetWidth > MAX_DIM || targetHeight > MAX_DIM) {
            const scale = Math.min(MAX_DIM / targetWidth, MAX_DIM / targetHeight);
            targetWidth = Math.floor(targetWidth * scale);
            targetHeight = Math.floor(targetHeight * scale);
            console.warn(`Imagem reduzida para ${targetWidth}x${targetHeight} px (original: ${width}x${height}) para evitar travamento.`);
        }
        
        AppState.dimensions = `${width} x ${height} px` + (bestIndex > 0 ? ` (Visão Geral #${bestIndex})` : '');
        
        // Get geographic info
        const bbox = image.getBoundingBox();
        const geoKeys = image.getGeoKeys();
        
        updateLoadingProgress(55);
        document.getElementById('loader-subtitle').textContent = 'Decodificando bandas de cor (pode levar alguns segundos)...';
        
        // Read pixel data
        const rgb = await image.readRGB({
            window: [0, 0, width, height],
            width: targetWidth,
            height: targetHeight
        });
        
        updateLoadingProgress(75);
        document.getElementById('loader-subtitle').textContent = 'Renderizando imagem no canvas...';
        
        // Render to canvas
        const canvas = document.createElement('canvas');
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        const imgData = ctx.createImageData(targetWidth, targetHeight);
        const data = imgData.data;
        
        for (let i = 0, j = 0; i < rgb.length; i += 3, j += 4) {
            const r = rgb[i];
            const g = rgb[i+1];
            const b = rgb[i+2];
            data[j] = r;
            data[j+1] = g;
            data[j+2] = b;
            // Hide near-black nodata pixels
            if (r < 5 && g < 5 && b < 5) {
                data[j+3] = 0;
            } else {
                data[j+3] = 255;
            }
        }
        ctx.putImageData(imgData, 0, 0);
        
        updateLoadingProgress(90);
        document.getElementById('loader-subtitle').textContent = 'Construindo mapa espacial...';
        
        const dataUrl = canvas.toDataURL('image/webp', 0.92);
        
        // Georeferencing analysis (same logic as parseGeoTIFFBlob)
        if (bbox && bbox.length === 4) {
            const xmin = bbox[0], ymin = bbox[1], xmax = bbox[2], ymax = bbox[3];
            
            if (xmin >= -180 && xmax <= 180 && ymin >= -90 && ymax <= 90) {
                AppState.isGeoreferenced = true;
                AppState.geotagBounds = L.latLngBounds([ymin, xmin], [ymax, xmax]);
                AppState.crsName = 'EPSG:4326 (WGS 84)';
                
                initMap('geographic');
                AppState.orthophotoLayer = L.imageOverlay(dataUrl, AppState.geotagBounds, { crossOrigin: true }).addTo(AppState.map);
                AppState.map.fitBounds(AppState.geotagBounds);
            } else {
                let projected = false;
                let epsg = null;
                
                if (geoKeys) {
                    epsg = geoKeys.ProjectedCSTypeGeoKey || geoKeys.GeographicTypeGeoKey;
                }
                
                if (epsg) {
                    try {
                        await loadProj4();
                        const projDef = getProjCodeDefinition(epsg);
                        if (projDef) {
                            proj4.defs(`EPSG:${epsg}`, projDef);
                            const wgs84 = '+proj=longlat +datum=WGS84 +no_defs';
                            const minProj = proj4(`EPSG:${epsg}`, wgs84, [xmin, ymin]);
                            const maxProj = proj4(`EPSG:${epsg}`, wgs84, [xmax, ymax]);
                            
                            const bounds = L.latLngBounds([minProj[1], minProj[0]], [maxProj[1], maxProj[0]]);
                            
                            AppState.isGeoreferenced = true;
                            AppState.geotagBounds = bounds;
                            AppState.crsName = `EPSG:${epsg} (Projetado)`;
                            
                            initMap('geographic');
                            AppState.orthophotoLayer = L.imageOverlay(dataUrl, bounds, { crossOrigin: true }).addTo(AppState.map);
                            AppState.map.fitBounds(bounds);
                            projected = true;
                        }
                    } catch (e) {
                        console.error('Falha ao projetar via Proj4:', e);
                    }
                }
                
                if (!projected) {
                    setupFlatMapDisplay(dataUrl, width, height, 'Métrica UTM (Sem CRS no Navegador)');
                }
            }
        } else {
            setupFlatMapDisplay(dataUrl, width, height, 'Não Georreferenciado');
        }
        
        updateMetadataDisplay();
        switchScreen('viewer-screen');
        hideLoading();
        showToast('orto.tif carregado com sucesso!', 'success');
        
    } catch (err) {
        console.error('Erro ao carregar orto.tif do projeto:', err);
        hideLoading();
        showToast(err.message || 'Erro ao carregar o arquivo orto.tif do projeto.');
    }
}

/* ==========================================================================
   DEMO LOADERS
   ========================================================================== */
function loadDemoOrtho() {
    AppState.fileName = "ortofoto_inspecao_industrial_demo.png";
    AppState.fileSize = "8.4 MB";
    AppState.fileType = "PNG";
    
    showLoading("Carregando Ortofoto Demo", "Renderizando ortofoto da área industrial...", 50);
    
    // High-resolution aerial photograph from Wikimedia Commons
    const demoUrl = "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e0/Aerial_photograph_of_the_Ouse_Valley_Viaduct.jpg/1280px-Aerial_photograph_of_the_Ouse_Valley_Viaduct.jpg";
    
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.src = demoUrl;
    img.onload = () => {
        displayStandardImage(demoUrl, img.width, img.height);
        hideLoading();
        showToast("Ortofoto Demo carregada!", "success");
    };
    img.onerror = () => {
        hideLoading();
        showToast("Erro ao carregar imagem demo.");
    };
}

async function loadDemoGeoTIFF() {
    AppState.fileName = "amostra_geotiff_floresta.tif";
    AppState.fileSize = "1.8 MB";
    AppState.fileType = "TIFF";
    
    showLoading("Buscando GeoTIFF Demo", "Fazendo download do arquivo TIFF georreferenciado...", 30);
    
    // Small georeferenced TIFF from OpenLayers data samples
    const demoUrl = "https://openlayers.org/data/raster/no-overviews.tif";
    
    try {
        const response = await fetch(demoUrl);
        if (!response.ok) throw new Error("Erro ao baixar GeoTIFF demo.");
        const blob = await response.blob();
        await parseGeoTIFFBlob(blob);
        showToast("GeoTIFF Demo carregado com coordenadas geográficas!", "success");
    } catch (err) {
        console.error(err);
        hideLoading();
        showToast("Simulação ativada: O servidor bloqueou o acesso ao arquivo (CORS).", "warning");
        // Fallback to simulating a GeoTIFF using an image but with georeferenced attributes!
        simulateGeoreferencedDemo();
    }
}

function simulateGeoreferencedDemo() {
    // Simulate a georeferenced coordinate bounds near Pix Force HQ (Porto Alegre, Brazil)
    // Coords: ~ -30.0346 Lat, -51.2177 Lng
    const centerLat = -30.0346;
    const centerLng = -51.2177;
    const size = 0.005; // degree size (~500m)
    
    const bounds = L.latLngBounds(
        [centerLat - size, centerLng - size],
        [centerLat + size, centerLng + size]
    );
    
    AppState.isGeoreferenced = true;
    AppState.geotagBounds = bounds;
    AppState.crsName = "EPSG:31982 (SIRGAS 2000 / UTM zone 22S)";
    AppState.dimensions = "2400 x 1800 px";
    
    // Load a nice aerial image
    const simulatedImage = "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1b/Kolkata_aerial_view.jpg/1280px-Kolkata_aerial_view.jpg";
    
    initMap('geographic');
    
    AppState.orthophotoLayer = L.imageOverlay(simulatedImage, bounds, { crossOrigin: true }).addTo(AppState.map);
    AppState.map.fitBounds(bounds);
    
    updateMetadataDisplay();
    switchScreen('viewer-screen');
    hideLoading();
}

/* ==========================================================================
   GEOTIFF PARSING (geotiff.js)
   ========================================================================== */
async function parseGeoTIFFBlob(blob) {
    updateLoadingProgress(50);
    document.getElementById("loader-subtitle").textContent = "Lendo metadados do GeoTIFF...";
    
    // Usamos GeoTIFF.fromBlob(blob) diretamente em vez de blob.arrayBuffer().
    // Isso lê apenas os cabeçalhos do arquivo sob demanda, poupando memória RAM para arquivos de centenas de megabytes.
    const tiff = await GeoTIFF.fromBlob(blob);
    
    const imageCount = await tiff.getImageCount();
    let image = await tiff.getImage(0);
    
    // Find an overview image suitable for browser display memory constraints
    // If the full resolution is > 4096px, read the next readable scale
    let width = image.getWidth();
    let height = image.getHeight();
    let bestIndex = 0;
    
    for (let i = 0; i < imageCount; i++) {
        const img = await tiff.getImage(i);
        const w = img.getWidth();
        const h = img.getHeight();
        if (w <= 4096 && h <= 4096) {
            image = img;
            width = w;
            height = h;
            bestIndex = i;
            break;
        }
    }
    
    // Security to prevent Canvas Memory Limit Crash on huge images without overviews
    const MAX_DIM = 4096;
    let targetWidth = width;
    let targetHeight = height;
    
    if (targetWidth > MAX_DIM || targetHeight > MAX_DIM) {
        const scale = Math.min(MAX_DIM / targetWidth, MAX_DIM / targetHeight);
        targetWidth = Math.floor(targetWidth * scale);
        targetHeight = Math.floor(targetHeight * scale);
        console.warn(`Imagem muito grande sem visões gerais adequadas. Reduzindo renderização para ${targetWidth}x${targetHeight} px para evitar travamento.`);
    }
    
    AppState.dimensions = `${width} x ${height} px` + (bestIndex > 0 ? ` (Visão Geral #${bestIndex})` : '');
    
    // Try to get geographic bounding box
    const bbox = image.getBoundingBox(); // [xmin, ymin, xmax, ymax]
    const geoKeys = image.getGeoKeys();
    
    updateLoadingProgress(70);
    document.getElementById("loader-subtitle").textContent = "Decodificando bandas de cor...";
    
    // Read pixel data
    const rgb = await image.readRGB({
        window: [0, 0, width, height],
        width: targetWidth,
        height: targetHeight
    });
    
    // Render RGB data to canvas
    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const imgData = ctx.createImageData(targetWidth, targetHeight);
    const data = imgData.data;
    
    // Draw RGB and implement smart transparency: pure black border pixels (nodata) are set to transparent
    for (let i = 0, j = 0; i < rgb.length; i += 3, j += 4) {
        const r = rgb[i];
        const g = rgb[i+1];
        const b = rgb[i+2];
        
        data[j] = r;
        data[j+1] = g;
        data[j+2] = b;
        
        // Hide near-black nodata pixels (very common in drone orthophotos)
        if (r < 5 && g < 5 && b < 5) {
            data[j+3] = 0; // completely transparent alpha
        } else {
            data[j+3] = 255; // opaque
        }
    }
    ctx.putImageData(imgData, 0, 0);
    
    updateLoadingProgress(90);
    document.getElementById("loader-subtitle").textContent = "Construindo mapa espacial...";
    
    const dataUrl = canvas.toDataURL("image/webp", 0.92);
    
    // Georeferencing analysis
    if (bbox && bbox.length === 4) {
        const xmin = bbox[0];
        const ymin = bbox[1];
        const xmax = bbox[2];
        const ymax = bbox[3];
        
        // Check if coordinates look like Lat/Lng (WGS84 values)
        if (xmin >= -180 && xmax <= 180 && ymin >= -90 && ymax <= 90) {
            AppState.isGeoreferenced = true;
            AppState.geotagBounds = L.latLngBounds([ymin, xmin], [ymax, xmax]);
            AppState.crsName = "EPSG:4326 (WGS 84)";
            
            initMap('geographic');
            AppState.orthophotoLayer = L.imageOverlay(dataUrl, AppState.geotagBounds, { crossOrigin: true }).addTo(AppState.map);
            AppState.map.fitBounds(AppState.geotagBounds);
        } else {
            // Coordinates are projected (e.g. UTM meters). Try to load Proj4 and project.
            let projected = false;
            let epsg = null;
            
            if (geoKeys) {
                epsg = geoKeys.ProjectedCSTypeGeoKey || geoKeys.GeographicTypeGeoKey;
            }
            
            if (epsg) {
                try {
                    await loadProj4();
                    const projDef = getProjCodeDefinition(epsg);
                    if (projDef) {
                        proj4.defs(`EPSG:${epsg}`, projDef);
                        const wgs84 = "+proj=longlat +datum=WGS84 +no_defs";
                        const minProj = proj4(`EPSG:${epsg}`, wgs84, [xmin, ymin]);
                        const maxProj = proj4(`EPSG:${epsg}`, wgs84, [xmax, ymax]);
                        
                        // proj4 returns [Lng, Lat]
                        const bounds = L.latLngBounds([minProj[1], minProj[0]], [maxProj[1], maxProj[0]]);
                        
                        AppState.isGeoreferenced = true;
                        AppState.geotagBounds = bounds;
                        AppState.crsName = `EPSG:${epsg} (Projetado)`;
                        
                        initMap('geographic');
                        AppState.orthophotoLayer = L.imageOverlay(dataUrl, bounds, { crossOrigin: true }).addTo(AppState.map);
                        AppState.map.fitBounds(bounds);
                        projected = true;
                    }
                } catch (e) {
                    console.error("Falha ao projetar via Proj4:", e);
                }
            }
            
            if (!projected) {
                // Fail projection: Fallback to Flat space
                setupFlatMapDisplay(dataUrl, width, height, "Métrica UTM (Sem CRS no Navegador)");
            }
        }
    } else {
        // No bounding box info
        setupFlatMapDisplay(dataUrl, width, height, "Não Georreferenciado");
    }
    
    updateMetadataDisplay();
    switchScreen('viewer-screen');
    hideLoading();
}

async function parseStandardImageBlob(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        const dataUrl = e.target.result;
        const img = new Image();
        img.src = dataUrl;
        img.onload = () => {
            displayStandardImage(dataUrl, img.width, img.height);
            hideLoading();
        };
    };
    reader.readAsDataURL(file);
}

function displayStandardImage(dataUrl, width, height) {
    AppState.dimensions = `${width} x ${height} px`;
    setupFlatMapDisplay(dataUrl, width, height, "Não Georreferenciado");
    updateMetadataDisplay();
    switchScreen('viewer-screen');
}

function setupFlatMapDisplay(dataUrl, width, height, crsLabel) {
    AppState.isGeoreferenced = false;
    AppState.geotagBounds = [[0, 0], [height, width]];
    AppState.crsName = crsLabel;
    
    initMap('flat');
    
    const bounds = AppState.geotagBounds;
    AppState.orthophotoLayer = L.imageOverlay(dataUrl, bounds, { crossOrigin: true }).addTo(AppState.map);
    AppState.map.fitBounds(bounds);
}

/* ==========================================================================
   MAP LIFECYCLE AND BASEMAPS
   ========================================================================== */
function initMap(crsType) {
    if (AppState.map) {
        AppState.map.remove();
        AppState.map = null;
    }
    
    const mapOptions = {
        zoomControl: false, // will add in topright
        attributionControl: true
    };
    
    if (crsType === 'flat') {
        mapOptions.crs = L.CRS.Simple;
        mapOptions.minZoom = -4;
        mapOptions.maxZoom = 4;
    } else {
        mapOptions.crs = L.CRS.EPSG3857;
        mapOptions.minZoom = 1;
        mapOptions.maxZoom = 22;
    }
    
    AppState.map = L.map('map', mapOptions);
    L.control.zoom({ position: 'topright' }).addTo(AppState.map);
    
    // Add event listeners
    AppState.map.on('mousemove', onMapMouseMove);
    AppState.map.on('click', onMapClick);
    
    // Config basemaps
    const basemapGrid = document.getElementById("basemap-control");
    if (crsType === 'geographic') {
        basemapGrid.style.display = 'block';
        
        // Define base tile layers
        AppState.baseLayers.satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
        });
        
        AppState.baseLayers.osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{y}/{x}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        });
        
        // Set default
        setBasemap(AppState.activeBaseMap);
    } else {
        basemapGrid.style.display = 'none';
    }
}

function setBasemap(type) {
    if (!AppState.map || !AppState.isGeoreferenced) return;
    
    // Remove existing layers
    Object.values(AppState.baseLayers).forEach(layer => {
        if (AppState.map.hasLayer(layer)) {
            AppState.map.removeLayer(layer);
        }
    });
    
    AppState.activeBaseMap = type;
    
    if (type !== 'none' && AppState.baseLayers[type]) {
        AppState.baseLayers[type].addTo(AppState.map);
        // Ensure orthophoto layer is always on top
        if (AppState.orthophotoLayer) {
            AppState.orthophotoLayer.bringToFront();
        }
    }
}

function updateLayerStyles() {
    if (!AppState.orthophotoLayer) return;
    
    // Opacity
    AppState.orthophotoLayer.setOpacity(AppState.opacity / 100);
    
    // Filters (CSS applied to layer container)
    const layerEl = AppState.orthophotoLayer.getElement();
    if (layerEl) {
        layerEl.style.filter = `brightness(${AppState.filters.brightness}%) contrast(${AppState.filters.contrast}%) saturate(${AppState.filters.saturation}%)`;
    }
}

/* ==========================================================================
   MEASUREMENT TOOLS
   ========================================================================== */
function toggleMeasurementMode(mode) {
    // If clicking active mode, deactivate it
    if (AppState.measurementMode === mode) {
        deactivateMeasurementMode();
        return;
    }
    
    // Reset previous drawing
    clearMeasurement();
    
    AppState.measurementMode = mode;
    
    const btnDist = document.getElementById("tool-measure-dist");
    const btnArea = document.getElementById("tool-measure-area");
    
    btnDist.classList.remove('active');
    btnArea.classList.remove('active');
    
    const container = AppState.map.getContainer();
    container.style.cursor = 'crosshair';
    
    if (mode === 'distance') {
        btnDist.classList.add('active');
        showToast("Modo Medição de Distância Ativo. Clique no mapa para adicionar pontos.", "success");
    } else if (mode === 'area') {
        btnArea.classList.add('active');
        showToast("Modo Medição de Área Ativo. Clique para contornar a área (mínimo 3 pontos).", "success");
    }
}

function deactivateMeasurementMode() {
    AppState.measurementMode = 'none';
    document.getElementById("tool-measure-dist").classList.remove('active');
    document.getElementById("tool-measure-area").classList.remove('active');
    
    if (AppState.map) {
        AppState.map.getContainer().style.cursor = '';
    }
}

function clearMeasurement() {
    // Remove markers
    AppState.measurementMarkers.forEach(m => AppState.map.removeLayer(m));
    AppState.measurementMarkers = [];
    
    // Remove lines / polygons
    if (AppState.measurementLine) {
        AppState.map.removeLayer(AppState.measurementLine);
        AppState.measurementLine = null;
    }
    
    if (AppState.measurementPolygon) {
        AppState.map.removeLayer(AppState.measurementPolygon);
        AppState.measurementPolygon = null;
    }
    
    removeTempLayers();
    
    AppState.measurementPoints = [];
    
    document.getElementById("measurement-info").classList.add("hidden");
}

function removeTempLayers() {
    if (AppState.tempLine) {
        AppState.map.removeLayer(AppState.tempLine);
        AppState.tempLine = null;
    }
    if (AppState.tempPolygon) {
        AppState.map.removeLayer(AppState.tempPolygon);
        AppState.tempPolygon = null;
    }
}

function onMapClick(e) {
    if (AppState.measurementMode === 'none') return;
    
    const latlng = e.latlng;
    AppState.measurementPoints.push(latlng);
    
    // Create circle marker node
    const marker = L.marker(latlng, {
        icon: L.divIcon({
            className: 'measurement-node',
            html: ''
        }),
        draggable: false
    }).addTo(AppState.map);
    
    AppState.measurementMarkers.push(marker);
    
    const pointsCount = AppState.measurementPoints.length;
    
    if (AppState.measurementMode === 'distance') {
        if (!AppState.measurementLine) {
            AppState.measurementLine = L.polyline(AppState.measurementPoints, {
                className: 'measurement-line'
            }).addTo(AppState.map);
        } else {
            AppState.measurementLine.setLatLngs(AppState.measurementPoints);
        }
        
        updateDistanceResult();
    } else if (AppState.measurementMode === 'area') {
        // Line representation for < 3 points
        if (pointsCount < 3) {
            if (!AppState.measurementLine) {
                AppState.measurementLine = L.polyline(AppState.measurementPoints, {
                    className: 'measurement-line'
                }).addTo(AppState.map);
            } else {
                AppState.measurementLine.setLatLngs(AppState.measurementPoints);
            }
        } else {
            // Convert to polygon representation at 3+ points
            if (AppState.measurementLine) {
                AppState.map.removeLayer(AppState.measurementLine);
                AppState.measurementLine = null;
            }
            
            if (!AppState.measurementPolygon) {
                AppState.measurementPolygon = L.polygon(AppState.measurementPoints, {
                    className: 'measurement-polygon'
                }).addTo(AppState.map);
            } else {
                AppState.measurementPolygon.setLatLngs(AppState.measurementPoints);
            }
            
            updateAreaResult();
        }
    }
}

function onMapMouseMove(e) {
    // 1. Coordinates readout
    const coordsDisplay = document.getElementById("coords-display");
    const latlng = e.latlng;
    
    if (AppState.isGeoreferenced) {
        coordsDisplay.textContent = `Cursor: Lat ${latlng.lat.toFixed(6)}, Lng ${latlng.lng.toFixed(6)}`;
    } else {
        // Flat pixel coordinates
        coordsDisplay.textContent = `Cursor: X ${Math.round(latlng.lng)} px, Y ${Math.round(latlng.lat)} px`;
    }
    
    // 2. Rubber-band preview line for drawing
    if (AppState.measurementMode === 'none' || AppState.measurementPoints.length === 0) return;
    
    const startPoint = AppState.measurementPoints[AppState.measurementPoints.length - 1];
    
    removeTempLayers();
    
    if (AppState.measurementMode === 'distance') {
        AppState.tempLine = L.polyline([startPoint, latlng], {
            className: 'measurement-temp-line'
        }).addTo(AppState.map);
    } else if (AppState.measurementMode === 'area') {
        const pointsCount = AppState.measurementPoints.length;
        if (pointsCount === 1) {
            AppState.tempLine = L.polyline([startPoint, latlng], {
                className: 'measurement-temp-line'
            }).addTo(AppState.map);
        } else if (pointsCount >= 2) {
            // Draw a temporary polygon overlay including the cursor
            const polygonPoints = [...AppState.measurementPoints, latlng];
            AppState.tempPolygon = L.polygon(polygonPoints, {
                className: 'measurement-polygon',
                dashArray: '5, 5'
            }).addTo(AppState.map);
        }
    }
}

// Distance Calculation
function updateDistanceResult() {
    let totalDist = 0;
    const pts = AppState.measurementPoints;
    
    if (AppState.isGeoreferenced) {
        for (let i = 0; i < pts.length - 1; i++) {
            totalDist += pts[i].distanceTo(pts[i+1]);
        }
        
        let formattedDist = totalDist > 1000 
            ? `${(totalDist / 1000).toFixed(3)} km`
            : `${totalDist.toFixed(1)} m`;
            
        displayMeasurementBox(formattedDist, null);
    } else {
        // Flat pixel distance
        for (let i = 0; i < pts.length - 1; i++) {
            const p1 = pts[i];
            const p2 = pts[i+1];
            const dx = p2.lng - p1.lng;
            const dy = p2.lat - p1.lat;
            totalDist += Math.sqrt(dx*dx + dy*dy);
        }
        
        // Convert to simulated meters using resolution scale
        const pxDist = Math.round(totalDist);
        const meterDist = totalDist * AppState.pixelToMetersScale;
        const text = `${meterDist.toFixed(1)} m (${pxDist} px)`;
        
        displayMeasurementBox(text, null);
    }
}

// Area Calculation (Shoelace Formula projected on tangent plane for geodesic accuracy)
function updateAreaResult() {
    const pts = AppState.measurementPoints;
    if (pts.length < 3) return;
    
    let area = 0;
    
    if (AppState.isGeoreferenced) {
        // Project LatLngs to local tangent plane coordinates in meters around the centroid
        const origin = pts[0];
        const coordsInMeters = pts.map(p => {
            const y = (p.lat - origin.lat) * 111132;
            const x = (p.lng - origin.lng) * 111132 * Math.cos(origin.lat * Math.PI / 180);
            return { x, y };
        });
        
        const numPoints = coordsInMeters.length;
        for (let i = 0; i < numPoints; i++) {
            const p1 = coordsInMeters[i];
            const p2 = coordsInMeters[(i + 1) % numPoints];
            area += (p1.x * p2.y) - (p2.x * p1.y);
        }
        area = Math.abs(area / 2);
        
        // Format geodesic area
        let formattedArea = area > 10000
            ? `${(area / 10000).toFixed(2)} ha (hectares)`
            : `${area.toFixed(1)} m²`;
            
        // Distances perimeter
        let perimeter = 0;
        for (let i = 0; i < pts.length; i++) {
            perimeter += pts[i].distanceTo(pts[(i + 1) % pts.length]);
        }
        let formattedPerim = perimeter > 1000
            ? `${(perimeter / 1000).toFixed(3)} km`
            : `${perimeter.toFixed(1)} m`;
            
        displayMeasurementBox(formattedPerim, formattedArea);
    } else {
        // Flat area in pixels
        const numPoints = pts.length;
        for (let i = 0; i < numPoints; i++) {
            const p1 = pts[i];
            const p2 = pts[(i + 1) % numPoints];
            area += (p1.lng * p2.lat) - (p2.lng * p1.lat);
        }
        area = Math.abs(area / 2);
        
        // Convert to simulated meters squared
        const pxArea = Math.round(area);
        const meterArea = area * (AppState.pixelToMetersScale * AppState.pixelToMetersScale);
        
        const formattedArea = `${meterArea.toFixed(1)} m² (${pxArea} px²)`;
        
        // Perimeter
        let perimeter = 0;
        for (let i = 0; i < pts.length; i++) {
            const p1 = pts[i];
            const p2 = pts[(i + 1) % pts.length];
            const dx = p2.lng - p1.lng;
            const dy = p2.lat - p1.lat;
            perimeter += Math.sqrt(dx*dx + dy*dy);
        }
        const formattedPerim = `${(perimeter * AppState.pixelToMetersScale).toFixed(1)} m (${Math.round(perimeter)} px)`;
        
        displayMeasurementBox(formattedPerim, formattedArea);
    }
}

function displayMeasurementBox(distanceText, areaText) {
    const box = document.getElementById("measurement-info");
    const distRow = document.getElementById("result-distance-row");
    const distVal = document.getElementById("result-distance");
    const areaRow = document.getElementById("result-area-row");
    const areaVal = document.getElementById("result-area");
    
    distVal.textContent = distanceText;
    
    if (areaText) {
        areaVal.textContent = areaText;
        areaRow.classList.remove('hidden');
    } else {
        areaRow.classList.add('hidden');
    }
    
    box.classList.remove('hidden');
}

/* ==========================================================================
   METADATA PANEL UPDATE
   ========================================================================== */
function updateMetadataDisplay() {
    document.getElementById("loaded-file-name").textContent = AppState.fileName;
    document.getElementById("file-size-badge").textContent = AppState.fileSize;
    
    document.getElementById("meta-resolution").textContent = AppState.dimensions;
    document.getElementById("meta-type").textContent = AppState.fileType;
    
    const georefBadge = document.getElementById("meta-georef");
    const boundsContainer = document.getElementById("meta-bounds-container");
    const boundsDisplay = document.getElementById("meta-bounds");
    
    if (AppState.isGeoreferenced) {
        georefBadge.textContent = "SIM";
        georefBadge.className = "value badge-status active";
        boundsContainer.style.display = "block";
        
        const bounds = AppState.geotagBounds;
        const sw = bounds.getSouthWest();
        const ne = bounds.getNorthEast();
        boundsDisplay.textContent = `SW: ${sw.lat.toFixed(4)}, ${sw.lng.toFixed(4)}\nNE: ${ne.lat.toFixed(4)}, ${ne.lng.toFixed(4)}`;
        
        document.getElementById("projection-display-container").style.display = "flex";
        document.getElementById("projection-display").textContent = AppState.crsName;
    } else {
        georefBadge.textContent = "NÃO";
        georefBadge.className = "value badge-status";
        boundsContainer.style.display = "none";
        
        document.getElementById("projection-display-container").style.display = "none";
    }
}

/* ==========================================================================
   PROJ4 LOADER AND GEOTIFF COORDINATE DEFINITIONS
   ========================================================================== */
async function loadProj4() {
    if (window.proj4) return;
    return new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "https://cdnjs.cloudflare.com/ajax/libs/proj4js/2.9.2/proj4.js";
        script.onload = () => {
            console.log("Proj4.js carregado com sucesso!");
            resolve();
        };
        script.onerror = () => {
            reject(new Error("Falha ao carregar script Proj4 de projeções."));
        };
        document.head.appendChild(script);
    });
}

// Maps EPSG code to Proj4 parameter strings
function getProjCodeDefinition(epsg) {
    const code = parseInt(epsg);
    
    // WGS 84 / UTM North (32601 - 32660)
    if (code >= 32601 && code <= 32660) {
        const zone = code - 32600;
        return `+proj=utm +zone=${zone} +datum=WGS84 +units=m +no_defs`;
    }
    
    // WGS 84 / UTM South (32701 - 32760)
    if (code >= 32701 && code <= 32760) {
        const zone = code - 32700;
        return `+proj=utm +zone=${zone} +south +datum=WGS84 +units=m +no_defs`;
    }
    
    // SIRGAS 2000 / UTM South (31981 - 31985) - Standard for Brazil
    if (code >= 31975 && code <= 31985) {
        const zone = code - 31960;
        return `+proj=utm +zone=${zone} +south +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs`;
    }
    
    // SIRGAS 2000 / UTM North (31965 - 31975)
    if (code >= 31965 && code <= 31974) {
        const zone = code - 31950;
        return `+proj=utm +zone=${zone} +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs`;
    }
    
    // SAD69 / UTM South (29181 - 29195) - Old Brazilian Standard
    if (code >= 29175 && code <= 29195) {
        const zone = code - 29160;
        return `+proj=utm +zone=${zone} +south +ellps=aust_SA +towgs84=-67,2,1,0,0,0,0 +units=m +no_defs`;
    }
    
    console.warn(`Código EPSG ${epsg} não mapeado no lookup interno.`);
    return null;
}

/* ==========================================================================
   NAVIGATION AND HELPER UTILITIES
   ========================================================================== */
function switchScreen(screenId) {
    document.querySelectorAll(".screen").forEach(s => s.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
    
    // Invalidate map layout to ensure Leaflet renders correctly after display block
    if (screenId === 'viewer-screen' && AppState.map) {
        setTimeout(() => {
            AppState.map.invalidateSize();
        }, 100);
    }
}

function exitViewer() {
    clearMeasurement();
    deactivateMeasurementMode();
    
    if (AppState.orthophotoLayer && AppState.map) {
        AppState.map.removeLayer(AppState.orthophotoLayer);
        AppState.orthophotoLayer = null;
    }
    
    // Clear forms
    document.getElementById("url-input").value = "";
    document.getElementById("file-input").value = "";
    
    switchScreen('upload-screen');
}

function getFileExtension(filename) {
    return filename.slice((filename.lastIndexOf(".") - 1 >>> 0) + 2);
}

function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

function getUrlFileName(url) {
    try {
        const pathname = new URL(url).pathname;
        return pathname.substring(pathname.lastIndexOf('/') + 1);
    } catch (e) {
        return "";
    }
}
