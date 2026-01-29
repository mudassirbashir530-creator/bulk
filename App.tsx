
import React, { useState, useRef } from 'react';
import { 
  CloudArrowUpIcon, 
  TrashIcon, 
  Cog6ToothIcon, 
  PhotoIcon,
  CheckCircleIcon,
  ArrowDownTrayIcon,
  QueueListIcon,
  BoltIcon,
  SparklesIcon,
  ShieldCheckIcon,
  CpuChipIcon,
  ExclamationCircleIcon,
  MagnifyingGlassIcon,
  AdjustmentsHorizontalIcon
} from '@heroicons/react/24/outline';
import { ProcessingState } from './types';
import { getSmartLogoPosition } from './services/geminiService';
import { processProductImage } from './services/imageProcessor';

declare var JSZip: any;

const App: React.FC = () => {
  const [images, setImages] = useState<File[]>([]);
  const [brandLogo, setBrandLogo] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processStates, setProcessStates] = useState<ProcessingState[]>([]);
  const [zipUrl, setZipUrl] = useState<string | null>(null);
  const [currentIdx, setCurrentIdx] = useState<number>(-1);
  const [logoPadding, setLogoPadding] = useState<number>(50);
  
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const handleAssetUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setBrandLogo(event.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleBulkUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      setImages(prev => [...prev, ...newFiles]);
      setZipUrl(null);
    }
  };

  const clearAll = () => {
    if (zipUrl) URL.revokeObjectURL(zipUrl);
    setImages([]);
    setProcessStates([]);
    setZipUrl(null);
    setCurrentIdx(-1);
  };

  const startProcessing = async () => {
    if (images.length === 0 || !brandLogo) return;
    setIsProcessing(true);
    setZipUrl(null);
    
    setProcessStates(images.map((f, i) => ({
      id: `${f.name}-${i}`,
      name: f.name,
      status: 'pending',
      progress: 0,
    })));

    const zip = new JSZip();

    for (let i = 0; i < images.length; i++) {
      const file = images[i];
      setCurrentIdx(i);

      const updateStatus = (update: Partial<ProcessingState>) => {
        setProcessStates(prev => {
          const newState = [...prev];
          newState[i] = { ...newState[i], ...update };
          return newState;
        });
      };

      try {
        const sourceUrl = URL.createObjectURL(file);
        
        // Phase 1: AI Scene Analysis + Object Detection
        updateStatus({ status: 'analyzing', progress: 15 });
        const sourceBase64 = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target?.result as string);
          reader.readAsDataURL(file);
        });
        
        const placement = await getSmartLogoPosition(sourceBase64);
        updateStatus({ placement }); // Store placement for UI feedback
        
        // Phase 2: Dual-Purpose Branding Engine
        updateStatus({ status: 'processing', progress: 60 });
        const { fullRes, thumb } = await processProductImage(sourceUrl, placement, {
          brandLogo: brandLogo,
          watermarkOpacity: 0.40,
          quality: 1.0, 
          logoPadding: logoPadding // Passing the user-defined padding
        });

        // Phase 3: Encoding & Buffering
        updateStatus({ status: 'processing', progress: 90 });
        const base64Content = fullRes.split(',')[1];
        zip.file(`${file.name.split('.')[0]}_HD.jpg`, base64Content, { base64: true });

        // Phase 4: Finalization
        const showPreview = i >= images.length - 20; // Keep slightly more previews
        updateStatus({ 
          status: 'completed', 
          progress: 100, 
          resultUrl: showPreview ? thumb : undefined 
        });
        
        URL.revokeObjectURL(sourceUrl);
        await new Promise(r => setTimeout(r, 40));

      } catch (error) {
        console.error("Engine failure on file:", file.name, error);
        updateStatus({ status: 'error', error: 'Skipped', progress: 0 });
      }
    }

    try {
      const content = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(content);
      setZipUrl(url);
    } catch (err) {
      console.error('ZIP aggregation failed', err);
    }

    setIsProcessing(false);
    setCurrentIdx(-1);
  };

  const batchProgress = images.length > 0 ? Math.round(((currentIdx === -1 ? (zipUrl ? images.length : 0) : currentIdx) / images.length) * 100) : 0;
  const currentItem = currentIdx !== -1 ? processStates[currentIdx] : null;

  return (
    <div className="flex h-screen text-white/90 p-6 gap-6">
      {/* SIDEBAR */}
      <aside className="w-80 glass rounded-[32px] flex flex-col z-20 shrink-0 overflow-hidden">
        <div className="p-8 border-b border-white/10">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center border border-white/20 shadow-xl">
              <CpuChipIcon className="w-6 h-6 text-pink-400" />
            </div>
            <div>
              <h1 className="font-black text-xl tracking-tight">HD FORGE</h1>
              <p className="text-[9px] font-bold text-pink-300 tracking-widest mt-1 uppercase opacity-60">Production Engine</p>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-10 custom-scroll">
          <section>
            <h3 className="text-[10px] font-black text-white/30 uppercase tracking-widest mb-6 flex items-center gap-2">
              <SparklesIcon className="w-4 h-4" /> Brand Asset
            </h3>
            
            <div className="space-y-4">
              <div className="relative glass-card p-6 group transition-all">
                <label className="block text-[9px] font-black text-white/50 mb-4 uppercase tracking-wider">Master Logo (PNG/JPG)</label>
                {brandLogo ? (
                  <div className="relative">
                    <img src={brandLogo} className="h-24 w-full object-contain drop-shadow-2xl" alt="Brand Logo" />
                    <button onClick={() => setBrandLogo(null)} className="absolute -top-4 -right-4 bg-red-500/80 p-2 rounded-full shadow-2xl hover:bg-red-500 transition-colors"><TrashIcon className="w-4 h-4 text-white"/></button>
                    <p className="text-[8px] text-pink-300 font-bold mt-4 text-center uppercase tracking-widest opacity-60">Used for Watermark & Corner</p>
                  </div>
                ) : (
                  <div className="text-center py-6 flex flex-col items-center">
                    <PhotoIcon className="w-10 h-10 text-white/10 mb-4 group-hover:text-white/30 transition-colors" />
                    <p className="text-[10px] text-white/30 font-bold uppercase tracking-widest">Select Brand Logo</p>
                    <input type="file" onChange={handleAssetUpload} className="absolute inset-0 opacity-0 cursor-pointer" />
                  </div>
                )}
              </div>
            </div>
          </section>

          <section>
            <h3 className="text-[10px] font-black text-white/30 uppercase tracking-widest mb-6 flex items-center gap-2">
              <AdjustmentsHorizontalIcon className="w-4 h-4" /> Configuration
            </h3>
            <div className="glass-card p-6 space-y-6">
              <div>
                <div className="flex justify-between items-center mb-4">
                  <label className="text-[9px] font-black text-white/50 uppercase tracking-wider">Logo Padding</label>
                  <span className="text-[10px] font-black text-pink-400">{logoPadding}px</span>
                </div>
                <input 
                  type="range" 
                  min="0" 
                  max="200" 
                  value={logoPadding} 
                  onChange={(e) => setLogoPadding(parseInt(e.target.value))}
                  className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-pink-500"
                />
                <div className="flex justify-between mt-2 text-[7px] font-bold text-white/20 uppercase tracking-tighter">
                  <span>Tight</span>
                  <span>Loose</span>
                </div>
              </div>
            </div>
          </section>

          <section>
            <h3 className="text-[10px] font-black text-white/30 uppercase tracking-widest mb-6 flex items-center gap-2">
              <ShieldCheckIcon className="w-4 h-4" /> AI Guard Mode
            </h3>
            <div className="glass-card p-5 space-y-4">
              <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-tighter">
                <span className="opacity-40">Object Detection</span>
                <span className="text-blue-400">ACTIVE</span>
              </div>
              <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-tighter">
                <span className="opacity-40">Collision Check</span>
                <span className="text-purple-400 italic">ENABLED</span>
              </div>
              <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-tighter">
                <span className="opacity-40">Placement Logic</span>
                <span className="text-pink-400">SMART CORNER</span>
              </div>
            </div>
          </section>
        </div>
      </aside>

      {/* MAIN VIEW */}
      <main className="flex-1 flex flex-col gap-6 overflow-hidden">
        <header className="h-28 glass px-10 rounded-[32px] flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-3xl font-black tracking-tighter flex items-center gap-4 uppercase">
              Production Floor
              {isProcessing && <div className="w-3 h-3 bg-pink-500 rounded-full animate-ping shadow-[0_0_20px_rgba(236,72,153,0.8)]" />}
            </h2>
            <p className="text-[10px] font-bold text-white/30 uppercase tracking-[0.4em] mt-2">Sequential Processing Logic Active • 100% Quality Export</p>
          </div>
          
          <div className="flex items-center gap-6">
            {images.length > 0 && !isProcessing && (
              <button onClick={clearAll} className="text-[10px] font-black text-white/40 uppercase tracking-widest hover:text-white transition-colors">
                Reset Gallery
              </button>
            )}
            
            <button 
              onClick={startProcessing}
              disabled={isProcessing || images.length === 0 || !brandLogo}
              className={`btn-glossy px-14 py-6 rounded-[24px] text-[11px] font-black uppercase tracking-[0.2em] flex items-center gap-4 transition-all ${
                isProcessing || images.length === 0 || !brandLogo
                ? 'opacity-20 grayscale cursor-not-allowed shadow-none' 
                : 'shadow-[0_20px_60px_rgba(0,0,0,0.4)]'
              }`}
            >
              {isProcessing ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                  Processing Unit {currentIdx + 1}
                </>
              ) : (
                <>
                  <BoltIcon className="w-5 h-5 text-pink-400" />
                  Start Branding
                </>
              )}
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto pr-2 custom-scroll">
          {images.length === 0 ? (
            <div className="h-full glass rounded-[32px] flex flex-col items-center justify-center text-center p-20">
              <div className="w-32 h-32 glass-card flex items-center justify-center mb-10 shadow-2xl border border-white/5">
                <QueueListIcon className="w-16 h-16 text-white/5" />
              </div>
              <h3 className="text-4xl font-black mb-6 tracking-tighter">Deck Empty</h3>
              <p className="text-white/20 font-bold max-w-sm mb-12 uppercase text-[10px] tracking-[0.5em]">
                Drop massive product galleries. Optimized for 1000+ images with AI object detection.
              </p>
              <button 
                onClick={() => galleryInputRef.current?.click()}
                className="btn-glossy bg-white/95 text-black px-20 py-7 rounded-[28px] font-black text-xs uppercase tracking-widest shadow-2xl"
              >
                Upload Gallery
              </button>
            </div>
          ) : (
            <div className="space-y-6 pb-24">
              
              {/* ADVANCED LIVE PROGRESS HUD */}
              {isProcessing && (
                <div className="glass p-12 rounded-[40px] mb-8 overflow-hidden relative shadow-2xl border-white/5">
                  <div className="grid grid-cols-2 gap-12 mb-10">
                    {/* Batch Tracking */}
                    <div>
                      <div className="flex justify-between items-end mb-4">
                        <div className="flex flex-col">
                          <span className="text-[10px] font-black uppercase tracking-[0.5em] text-white/30 mb-1">Batch Operation</span>
                          <h4 className="text-xl font-black text-white/90 italic tracking-tighter">Processing Asset {currentIdx + 1} of {images.length}</h4>
                        </div>
                        <span className="text-2xl font-black text-blue-400 tabular-nums">{batchProgress}%</span>
                      </div>
                      <div className="h-4 bg-white/5 rounded-full overflow-hidden border border-white/10 p-0.5">
                        <div 
                          className="h-full bg-gradient-to-r from-blue-600 to-blue-400 rounded-full transition-all duration-700 ease-out shadow-[0_0_20px_rgba(59,130,246,0.3)]"
                          style={{ width: `${batchProgress}%` }}
                        />
                      </div>
                    </div>

                    {/* Unit Level Tracking */}
                    <div>
                      <div className="flex justify-between items-end mb-4">
                        <div className="flex flex-col">
                          <span className="text-[10px] font-black uppercase tracking-[0.5em] text-white/30 mb-1">Unit Status</span>
                          <h4 className="text-xl font-black text-pink-400 italic tracking-tighter">
                            {currentItem?.status === 'analyzing' ? 'Object Detection...' : 'Applying Branding...'}
                          </h4>
                        </div>
                        <span className="text-2xl font-black text-pink-400 tabular-nums">{currentItem?.progress || 0}%</span>
                      </div>
                      <div className="h-4 bg-white/5 rounded-full overflow-hidden border border-white/10 p-0.5">
                        <div 
                          className="h-full bg-gradient-to-r from-pink-600 to-pink-400 rounded-full transition-all duration-300 ease-out shadow-[0_0_20px_rgba(236,72,153,0.3)]"
                          style={{ width: `${currentItem?.progress || 0}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-between items-center pt-8 border-t border-white/5">
                    <div className="flex gap-8">
                      <div className="flex items-center gap-3">
                        <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                        <span className="text-[9px] font-bold text-white/40 uppercase tracking-widest">Global Stream</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="w-2 h-2 bg-pink-500 rounded-full animate-ping" />
                        <span className="text-[9px] font-bold text-white/40 uppercase tracking-widest">Vision Logic</span>
                      </div>
                    </div>
                    <p className="text-[9px] font-black text-white/20 uppercase tracking-[0.3em] truncate max-w-[200px]">
                      Current: {images[currentIdx]?.name}
                    </p>
                  </div>
                </div>
              )}

              {/* FINAL EXPORT BANNER */}
              {zipUrl && (
                <div className="glass p-14 rounded-[40px] flex items-center justify-between border-teal-500/20 bg-teal-500/5 mb-8 animate-in slide-in-from-top-12 duration-1000 shadow-[0_40px_100px_rgba(0,0,0,0.5)]">
                  <div className="flex items-center gap-10">
                    <div className="bg-white/95 p-8 rounded-[32px] shadow-2xl">
                      <ArrowDownTrayIcon className="w-16 h-16 text-teal-600" />
                    </div>
                    <div>
                      <h4 className="text-4xl font-black tracking-tighter italic">PRODUCTION COMPLETE</h4>
                      <p className="text-teal-300 text-[11px] font-black uppercase tracking-[0.5em] mt-3 opacity-70">
                        {images.length} ULTRA-HD branded files packaged in ZIP
                      </p>
                    </div>
                  </div>
                  <a 
                    href={zipUrl} 
                    download="HD_PRODUCTION_BATCH.zip"
                    className="btn-glossy bg-teal-500 text-white px-20 py-8 rounded-[30px] font-black text-sm uppercase tracking-[0.2em] shadow-2xl"
                  >
                    Download All (ZIP)
                  </a>
                </div>
              )}

              {/* BATCH STATUS LIST */}
              <div className="grid grid-cols-1 gap-3">
                {images.map((file, idx) => {
                  const state = processStates[idx];
                  const isActive = currentIdx === idx;
                  const isFinished = state?.status === 'completed';
                  const isQueued = !isActive && !isFinished && state?.status === 'pending';
                  const isError = state?.status === 'error';
                  
                  // Adaptive Rendering for High Batch counts
                  const shouldRender = isActive || isFinished || (idx > currentIdx && idx < currentIdx + 15);
                  if (!shouldRender && images.length > 50) return null;

                  return (
                    <div 
                      key={`${file.name}-${idx}`} 
                      className={`glass-card p-5 flex items-center gap-6 transition-all duration-500 rounded-[24px] ${
                        isActive 
                        ? 'bg-white/10 scale-[1.01] border-pink-500/30 shadow-[0_20px_40px_rgba(236,72,153,0.15)] ring-1 ring-pink-500/20' 
                        : isFinished 
                          ? 'opacity-80 border-teal-500/10' 
                          : 'opacity-40 grayscale-[0.5]'
                      }`}
                    >
                      <div className={`w-20 h-20 glass rounded-[18px] shrink-0 flex items-center justify-center overflow-hidden border-white/10 shadow-inner relative group`}>
                        {state?.resultUrl ? (
                          <>
                            <img src={state.resultUrl} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" />
                            {/* Overlay detected bounding box on preview for cool AI feel */}
                            {state.placement?.boundingBox && (
                              <div 
                                className="absolute border border-pink-500/50 bg-pink-500/10 pointer-events-none transition-opacity duration-300 opacity-0 group-hover:opacity-100"
                                style={{
                                  top: `${state.placement.boundingBox.ymin / 10}%`,
                                  left: `${state.placement.boundingBox.xmin / 10}%`,
                                  width: `${(state.placement.boundingBox.xmax - state.placement.boundingBox.xmin) / 10}%`,
                                  height: `${(state.placement.boundingBox.ymax - state.placement.boundingBox.ymin) / 10}%`,
                                }}
                              />
                            )}
                          </>
                        ) : isActive ? (
                          <div className="w-8 h-8 border-3 border-white/5 border-t-pink-400 rounded-full animate-spin" />
                        ) : isFinished ? (
                          <CheckCircleIcon className="w-10 h-10 text-teal-500/30" />
                        ) : isError ? (
                          <ExclamationCircleIcon className="w-10 h-10 text-red-500/50" />
                        ) : (
                          <PhotoIcon className="w-8 h-8 text-white/5" />
                        )}
                        
                        {isFinished && (
                          <div className="absolute top-1 right-1">
                            <CheckCircleIcon className="w-4 h-4 text-teal-400 drop-shadow-[0_0_8px_rgba(45,212,191,0.8)]" />
                          </div>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-4 mb-2">
                          <p className={`text-md font-black truncate uppercase tracking-tight ${isActive ? 'text-pink-300' : isFinished ? 'text-white/70' : 'text-white/30'}`}>
                            {file.name}
                          </p>
                          {state?.placement?.boundingBox && (
                            <span className="text-[7px] font-black text-blue-400 uppercase tracking-widest bg-blue-400/10 px-2 py-0.5 rounded border border-blue-400/20">AI Detected</span>
                          )}
                          <span className="text-[8px] font-black text-white/10 uppercase tracking-widest shrink-0">{(file.size / 1024 / 1024).toFixed(2)} MB</span>
                        </div>
                        
                        {isActive && (
                          <div className="flex items-center gap-3">
                            <div className="flex-1 h-1 bg-white/5 rounded-full overflow-hidden">
                              <div 
                                className="h-full bg-pink-500 transition-all duration-300" 
                                style={{ width: `${state.progress}%` }} 
                              />
                            </div>
                            <span className="text-[8px] font-black text-pink-400 uppercase italic animate-pulse">{state.status}...</span>
                          </div>
                        )}

                        {isQueued && (
                          <div className="flex items-center gap-2">
                            <div className="h-1 w-full bg-white/5 rounded-full" />
                          </div>
                        )}
                        
                        {isFinished && (
                          <div className="flex items-center gap-3 mt-1">
                             <span className="text-[8px] font-bold text-white/20 uppercase tracking-widest">Location: {state.placement?.position?.replace('-', ' ')}</span>
                          </div>
                        )}
                      </div>

                      <div className="w-32 flex justify-end shrink-0">
                        {isFinished ? (
                          <span className="text-[9px] font-black text-teal-400 uppercase tracking-[0.3em] bg-teal-400/10 px-3 py-1.5 rounded-full border border-teal-400/20 shadow-[0_0_15px_rgba(45,212,191,0.1)]">Ready</span>
                        ) : isActive ? (
                          <div className="flex flex-col items-end gap-1">
                            <span className="text-[9px] font-black text-pink-400 uppercase tracking-[0.4em] animate-pulse italic">In Forge</span>
                            <div className="flex items-center gap-1 text-white/20">
                              <MagnifyingGlassIcon className="w-3 h-3" />
                              <span className="text-[7px] font-black uppercase">Vision active</span>
                            </div>
                          </div>
                        ) : isError ? (
                           <span className="text-[9px] font-black text-red-400 uppercase tracking-[0.4em]">Error</span>
                        ) : (
                          <span className="text-[9px] font-black text-white/5 uppercase tracking-[0.4em]">Standby</span>
                        )}
                      </div>
                    </div>
                  );
                })}
                
                {images.length > 50 && currentIdx + 15 < images.length && (
                  <div className="py-10 text-center opacity-10">
                    <p className="text-[10px] font-black uppercase tracking-[1em]">... {images.length - (currentIdx + 15)} Units In Queue ...</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </main>

      <input ref={galleryInputRef} type="file" multiple onChange={handleBulkUpload} className="hidden" accept="image/*" />
    </div>
  );
};

export default App;
