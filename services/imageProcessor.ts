
// Fix: Import SmartPlacement from types.ts where it is defined and exported.
import { ProcessingOptions, SmartPlacement } from "../types";

const loadImage = (url: string): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(new Error("Image Load Failed: " + e));
    img.src = url;
  });
};

/**
 * HD Liquid Image Processor (V2.4 - Single Asset Dual-Branding)
 * 1. Ultra HD Quality (1.0 Jpeg)
 * 2. Branding Phase 1: Logo as Central Watermark (80% Width, 40% Opacity)
 * 3. Branding Phase 2: Logo as Smart Corner (25% Width, Variable Padding)
 * 4. Generator-friendly memory disposal
 */
export const processProductImage = async (
  sourceUrl: string,
  placement: SmartPlacement,
  options: ProcessingOptions
): Promise<{ fullRes: string; thumb: string }> => {
  const { brandLogo, logoPadding } = options;

  const mainImg = await loadImage(sourceUrl);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  if (!ctx) throw new Error('Canvas context unavailable');

  // Lock resolution (No Downsampling)
  canvas.width = mainImg.width;
  canvas.height = mainImg.height;

  // Set production-grade interpolation (LANCZOS equivalent)
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // Draw background product
  ctx.drawImage(mainImg, 0, 0, canvas.width, canvas.height);

  if (brandLogo) {
    const logoImg = await loadImage(brandLogo);

    // STEP 1: CENTRAL WATERMARK (80% Width, 40% Opacity)
    ctx.save();
    const wmWidth = canvas.width * 0.8;
    const wmHeight = (logoImg.height / logoImg.width) * wmWidth;
    const wmX = (canvas.width - wmWidth) / 2;
    const wmY = (canvas.height - wmHeight) / 2;

    ctx.globalAlpha = 0.40; // High Visibility Spec
    ctx.drawImage(logoImg, wmX, wmY, wmWidth, wmHeight);
    ctx.restore();

    // STEP 2: SMART CORNER LOGO (25% Width, Variable Padding)
    const cWidth = canvas.width * 0.25; 
    const cHeight = (logoImg.height / logoImg.width) * cWidth;
    
    // User padding (scaled to 1000px base)
    const scaleFactor = canvas.width / 1000;
    const padding = logoPadding * scaleFactor;

    let cX = padding;
    let cY = padding;

    switch (placement.position) {
      case 'top-right':
        cX = canvas.width - cWidth - padding;
        break;
      case 'bottom-left':
        cY = canvas.height - cHeight - padding;
        break;
      case 'bottom-right':
        cX = canvas.width - cWidth - padding;
        cY = canvas.height - cHeight - padding;
        break;
      case 'center':
        cX = (canvas.width - cWidth) / 2;
        cY = (canvas.height - cHeight) / 2;
        break;
      default: // top-left
        break;
    }

    ctx.drawImage(logoImg, cX, cY, cWidth, cHeight);
    
    // Explicit cleanup
    (logoImg as any) = null;
  }

  // STEP 3: Ultra HD Export (quality: 1.0)
  const fullRes = canvas.toDataURL('image/jpeg', 1.0);
  
  // High-performance thumb for UI
  const thumbCanvas = document.createElement('canvas');
  const tCtx = thumbCanvas.getContext('2d');
  thumbCanvas.width = 150;
  thumbCanvas.height = (canvas.height / canvas.width) * 150;
  tCtx?.drawImage(canvas, 0, 0, thumbCanvas.width, thumbCanvas.height);
  const thumb = thumbCanvas.toDataURL('image/jpeg', 0.5);

  // Aggressive Memory Purge for 1000+ files
  canvas.width = 0;
  canvas.height = 0;
  thumbCanvas.width = 0;
  thumbCanvas.height = 0;
  
  return { fullRes, thumb };
};
