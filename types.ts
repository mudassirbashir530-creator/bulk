
export type LogoPosition = 'TOP_LEFT' | 'TOP_RIGHT' | 'BOTTOM_LEFT' | 'BOTTOM_RIGHT';

export interface BoundingBox {
  ymin: number;
  xmin: number;
  ymax: number;
  xmax: number;
}

export interface SmartPlacement {
  position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center';
  padding: number;
  boundingBox?: BoundingBox;
}

export interface ProcessingState {
  id: string;
  name: string;
  status: 'pending' | 'analyzing' | 'processing' | 'completed' | 'error';
  progress: number;
  resultUrl?: string;
  error?: string;
  placement?: SmartPlacement; // Store placement info for visualization
}

export interface ProcessingOptions {
  brandLogo?: string; // base64 source for both watermark and logo
  watermarkOpacity: number;
  quality: number;
  logoPadding: number; // Added user-defined padding
}
