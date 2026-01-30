
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
 * HD Liquid Image Processor (V2.5 - Production Optimized)
 * 1. Forced 1:1 Aspect Ratio (Square) output
 * 2. Ultra HD Quality (1.0 Jpeg)
 * 3. Dual-Branding Phase (Watermark + Smart Corner)
 * 4. Aggressive memory reclamation
 */
export const processProductImage = async (
  sourceUrl: string,
  placement: SmartPlacement,
  options: ProcessingOptions
): Promise<{ fullRes: string; thumb: string }> => {
  const { brandLogo, logoPadding, forceSquare = true } = options;

  const mainImg = await loadImage(sourceUrl);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  if (!ctx) throw new Error('Canvas context unavailable');

  // Determine output dimensions - Force 1:1 if requested
  let outWidth, outHeight;
  if (forceSquare) {
    const size = Math.max(mainImg.width, mainImg.height);
    outWidth = size;
    outHeight = size;
  } else {
    outWidth = mainImg.width;
    outHeight = mainImg.height;
  }

  canvas.width = outWidth;
  canvas.height = outHeight;

  // Set production-grade interpolation
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // Draw background - Center fit the product image into the square canvas
  if (forceSquare) {
    const scale = Math.min(outWidth / mainImg.width, outHeight / mainImg.height);
    const x = (outWidth - mainImg.width * scale) / 2;
    const y = (outHeight - mainImg.height * scale) / 2;
    // Fill background with white or transparency (using white for JPEG production)
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, outWidth, outHeight);
    ctx.drawImage(mainImg, x, y, mainImg.width * scale, mainImg.height * scale);
  } else {
    ctx.drawImage(mainImg, 0, 0, outWidth, outHeight);
  }

  if (brandLogo) {
    const logoImg = await loadImage(brandLogo);

    // STEP 1: CENTRAL WATERMARK (80% Width, 40% Opacity)
    ctx.save();
    const wmWidth = outWidth * 0.8;
    const wmHeight = (logoImg.height / logoImg.width) * wmWidth;
    const wmX = (outWidth - wmWidth) / 2;
    const wmY = (outHeight - wmHeight) / 2;

    ctx.globalAlpha = 0.40;
    ctx.drawImage(logoImg, wmX, wmY, wmWidth, wmHeight);
    ctx.restore();

    // STEP 2: SMART CORNER LOGO (25% Width, Variable Padding)
    const cWidth = outWidth * 0.25; 
    const cHeight = (logoImg.height / logoImg.width) * cWidth;
    const scaleFactor = outWidth / 1000;
    const padding = logoPadding * scaleFactor;

    let cX = padding;
    let cY = padding;

    switch (placement.position) {
      case 'top-right':
        cX = outWidth - cWidth - padding;
        break;
      case 'bottom-left':
        cY = outHeight - cHeight - padding;
        break;
      case 'bottom-right':
        cX = outWidth - cWidth - padding;
        cY = outHeight - cHeight - padding;
        break;
      case 'center':
        cX = (outWidth - cWidth) / 2;
        cY = (outHeight - cHeight) / 2;
        break;
      default: // top-left
        break;
    }

    ctx.drawImage(logoImg, cX, cY, cWidth, cHeight);
    (logoImg as any) = null;
  }

  // STEP 3: Ultra HD Export (quality: 1.0)
  const fullRes = canvas.toDataURL('image/jpeg', 1.0);
  
  // High-performance thumb for UI
  const thumbCanvas = document.createElement('canvas');
  const tCtx = thumbCanvas.getContext('2d');
  thumbCanvas.width = 150;
  thumbCanvas.height = 150;
  tCtx?.drawImage(canvas, 0, 0, 150, 150);
  const thumb = thumbCanvas.toDataURL('image/jpeg', 0.5);

  // Memory Cleanup
  canvas.width = 0;
  canvas.height = 0;
  thumbCanvas.width = 0;
  thumbCanvas.height = 0;
  (mainImg as any) = null;
  
  return { fullRes, thumb };
};
