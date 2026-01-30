
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { 
  TrashIcon, 
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
  AdjustmentsHorizontalIcon,
  PaintBrushIcon,
  PlusIcon,
  KeyIcon,
  ArrowPathIcon,
  Square3Stack3DIcon,
  CommandLineIcon,
  CloudIcon
} from '@heroicons/react/24/outline';
import { GoogleGenAI } from "@google/genai";
import { ProcessingState } from './types';
import { getSmartLogoPosition } from './services/geminiService';
import { processProductImage } from './services/imageProcessor';

declare var JSZip: any;
declare var window: any;

const ASPECT_RATIOS = [
  { label: '1:1 (Square)', value: '1:1' },
  { label: '3:4 (Classic)', value: '3:4' },
  { label: '4:3 (Landscape)', value: '4:3' },
  { label: '9:16 (Story)', value: '9:16' },
  { label: '16:9 (Cinema)', value: '16:9' },
];

const App: React.FC = () => {
  const [images, setImages] = useState<File[]>([]);
  const [brandLogo, setBrandLogo] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processStates, setProcessStates] = useState<ProcessingState[]>([]);
  const [zipUrl, setZipUrl] = useState<string | null>(null);
  const [currentIdx, setCurrentIdx] = useState<number>(-1);
  const [logoPadding, setLogoPadding] = useState<number>(50);
  const [batchSize, setBatchSize] = useState<number>(5); // Reduced default for Hobby tiers
  
  // Generative State
  const [activeTab, setActiveTab] = useState<'processor' | 'generator'>('processor');
  const [prompt, setPrompt] = useState('');
  const [selectedRatio, setSelectedRatio] = useState('1:1');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [apiKeyError, setApiKeyError] = useState<string | null>(null);

  const galleryInputRef = useRef<HTMLInputElement>(null);

  // Vercel Environment Guard
  useEffect(() => {
    const checkKey = async () => {
      // Priority 1: Check for provided AI Studio session key
      if (window.aistudio?.hasSelectedApiKey) {
        const selected = await window.aistudio.hasSelectedApiKey();
        setHasApiKey(selected);
      } 
      // Priority 2: Check for Hardcoded Environment variable (Vercel Secrets)
      else if (process.env.API_KEY) {
        setHasApiKey(true);
      } else {
        setApiKeyError('GOOGLE_API_KEY not detected in Vercel Secrets or Environment.');
      }
    };
    checkKey();
  }, []);

  const handleSelectKey = async () => {
    if (window.aistudio?.openSelectKey) {
      await window.aistudio.openSelectKey();
      setHasApiKey(true); 
      setApiKeyError(null);
    }
  };

  const handleAssetUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => setBrandLogo(event.target?.result as string);
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

  const generateImage = async () => {
    if (!prompt) return;
    setIsGenerating(true);
    setGeneratedImage(null);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-3-pro-image-preview',
        contents: { parts: [{ text: prompt }] },
        config: {
          imageConfig: {
            aspectRatio: selectedRatio as any,
            imageSize: "1K"
          }
        },
      });

      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
          setGeneratedImage(`data:image/png;base64,${part.inlineData.data}`);
          break;
        }
      }
    } catch (error: any) {
      console.error("Vercel Function Limit or API Error:", error);
      if (error.message?.includes("entity was not found")) setHasApiKey(false);
    } finally {
      setIsGenerating(false);
    }
  };

  const addToQueue = async () => {
    if (!generatedImage) return;
    const response = await fetch(generatedImage);
    const blob = await response.blob();
    const file = new File([blob], `AI_Gen_${Date.now()}.png`, { type: "image/png" });
    setImages(prev => [...prev, file]);
    setActiveTab('processor');
    setGeneratedImage(null);
    setPrompt('');
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
    if (!hasApiKey) {
      alert("Please configure GOOGLE_API_KEY in Vercel Secrets.");
      return;
    }

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
        updateStatus({ status: 'analyzing', progress: 15 });
        
        // Memory-safe Base64 conversion
        const sourceBase64 = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target?.result as string);
          reader.readAsDataURL(file);
        });
        
        // Single AI call per burst to stay within rate limits
        const placement = await getSmartLogoPosition(sourceBase64);
        updateStatus({ placement });
        
        updateStatus({ status: 'processing', progress: 60 });
        const { fullRes, thumb } = await processProductImage(sourceUrl, placement, {
          brandLogo: brandLogo,
          watermarkOpacity: 0.40,
          quality: 1.0, 
          logoPadding: logoPadding,
          forceSquare: true // Strictly 1:1 for export
        });

        updateStatus({ status: 'processing', progress: 90 });
        const base64Content = fullRes.split(',')[1];
        zip.file(`${file.name.split('.')[0]}_1x1_HD.jpg`, base64Content, { base64: true });

        updateStatus({ status: 'completed', progress: 100, resultUrl: thumb });
        
        URL.revokeObjectURL(sourceUrl);
        
        // BATCH BURST LOGIC: Prevent Browser/Vercel Hanging
        // We pause the main thread to allow Garbage Collection and DOM updates.
        if ((i + 1) % batchSize === 0) {
          await new Promise(r => setTimeout(r, 200)); 
        }

      } catch (error) {
        console.error("Vercel Execution Failure:", file.name, error);
        updateStatus({ status: 'error', error: 'Skipped', progress: 0 });
      }
    }

    try {
      const content = await zip.generateAsync({ type: 'blob' });
      setZipUrl(URL.createObjectURL(content));
    } catch (err) {
      console.error('ZIP Packaging Error:', err);
    }

    setIsProcessing(false);
    setCurrentIdx(-1);
  };

  const batchProgress = useMemo(() => 
    images.length > 0 ? Math.round(((currentIdx === -1 ? (zipUrl ? images.length : 0) : currentIdx) / images.length) * 100) : 0
  , [currentIdx, images.length, zipUrl]);

  return (
    <div className="flex h-screen text-white/90 p-6 gap-6 relative">
      {/* SIDEBAR */}
      <aside className="w-80 glass rounded-[32px] flex flex-col z-20 shrink-0 overflow-hidden">
        <div className="p-8 border-b border-white/10">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center border border-white/20 shadow-xl">
              <CloudIcon className="w-6 h-6 text-blue-400" />
            </div>
            <div>
              <h1 className="font-black text-xl tracking-tight">VERCEL HD</h1>
              <p className="text-[9px] font-bold text-blue-300 tracking-widest mt-1 uppercase opacity-60">Optimized Deployment</p>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-10 custom-scroll">
          <div className="flex p-1 bg-white/5 rounded-2xl border border-white/10">
            <button 
              onClick={() => setActiveTab('processor')}
              className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all ${activeTab === 'processor' ? 'bg-white/10 text-white shadow-xl' : 'text-white/30 hover:text-white/60'}`}
            >
              Processor
            </button>
            <button 
              onClick={() => setActiveTab('generator')}
              className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all ${activeTab === 'generator' ? 'bg-white/10 text-white shadow-xl' : 'text-white/30 hover:text-white/60'}`}
            >
              AI Lab
            </button>
          </div>

          {activeTab === 'processor' ? (
            <>
              <section>
                <h3 className="text-[10px] font-black text-white/30 uppercase tracking-widest mb-6 flex items-center gap-2">
                  <SparklesIcon className="w-4 h-4" /> Asset Hub
                </h3>
                <div className="space-y-4">
                  <div className="relative glass-card p-6 group transition-all">
                    <label className="block text-[9px] font-black text-white/50 mb-4 uppercase tracking-wider">Logo Branding</label>
                    {brandLogo ? (
                      <div className="relative">
                        <img src={brandLogo} className="h-24 w-full object-contain drop-shadow-2xl" alt="Brand Logo" />
                        <button onClick={() => setBrandLogo(null)} className="absolute -top-4 -right-4 bg-red-500/80 p-2 rounded-full shadow-2xl hover:bg-red-500 transition-colors"><TrashIcon className="w-4 h-4 text-white"/></button>
                      </div>
                    ) : (
                      <div className="text-center py-6 flex flex-col items-center">
                        <PhotoIcon className="w-10 h-10 text-white/10 mb-4 group-hover:text-white/30 transition-colors" />
                        <p className="text-[10px] text-white/30 font-bold uppercase tracking-widest">Select Logo</p>
                        <input type="file" onChange={handleAssetUpload} className="absolute inset-0 opacity-0 cursor-pointer" />
                      </div>
                    )}
                  </div>
                </div>
              </section>

              <section>
                <h3 className="text-[10px] font-black text-white/30 uppercase tracking-widest mb-6 flex items-center gap-2">
                  <AdjustmentsHorizontalIcon className="w-4 h-4" /> Cloud Config
                </h3>
                <div className="glass-card p-6 space-y-8">
                  <div>
                    <div className="flex justify-between items-center mb-4">
                      <label className="text-[9px] font-black text-white/50 uppercase tracking-wider">Logo Padding</label>
                      <span className="text-[10px] font-black text-pink-400">{logoPadding}px</span>
                    </div>
                    <input 
                      type="range" min="0" max="200" value={logoPadding} 
                      onChange={(e) => setLogoPadding(parseInt(e.target.value))}
                      className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-pink-500"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between items-center mb-4">
                      <label className="text-[9px] font-black text-white/50 uppercase tracking-wider">Burst Batching</label>
                      <span className="text-[10px] font-black text-blue-400">{batchSize} units</span>
                    </div>
                    <input 
                      type="range" min="1" max="20" value={batchSize} 
                      onChange={(e) => setBatchSize(parseInt(e.target.value))}
                      className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-blue-500"
                    />
                    <p className="text-[7px] text-white/20 mt-3 uppercase tracking-widest italic font-bold">Prevents Deployment Hang</p>
                  </div>
                </div>
              </section>
            </>
          ) : (
            <section className="space-y-8">
              {!hasApiKey && (
                <div className="glass-card p-6 border-pink-500/20 bg-pink-500/5">
                  <h4 className="text-[10px] font-black text-pink-400 uppercase tracking-[0.2em] mb-3">Vercel Secret Error</h4>
                  <p className="text-[10px] text-white/40 mb-6 font-medium leading-relaxed">
                    {apiKeyError || 'GOOGLE_API_KEY missing from secrets.'}
                  </p>
                  <button 
                    onClick={handleSelectKey}
                    className="w-full py-4 bg-white/90 text-black rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-white transition-all shadow-xl"
                  >
                    <KeyIcon className="w-4 h-4" /> Resolve Secret
                  </button>
                </div>
              )}

              <div>
                <h3 className="text-[10px] font-black text-white/30 uppercase tracking-widest mb-6 flex items-center gap-2">
                  <PaintBrushIcon className="w-4 h-4" /> Lab Prompt
                </h3>
                <textarea 
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Cinematic product shot of..."
                  className="w-full h-32 bg-white/5 border border-white/10 rounded-[20px] p-5 text-[11px] font-medium focus:ring-1 focus:ring-blue-500/50 focus:outline-none placeholder:text-white/10 custom-scroll"
                />
              </div>

              <button 
                onClick={generateImage}
                disabled={isGenerating || !prompt || !hasApiKey}
                className={`w-full py-6 rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] flex items-center justify-center gap-4 transition-all ${
                  isGenerating || !prompt || !hasApiKey
                  ? 'bg-white/5 text-white/20 cursor-not-allowed' 
                  : 'btn-glossy shadow-2xl bg-blue-600/20 border-blue-500/50'
                }`}
              >
                {isGenerating ? (
                  <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                ) : (
                  <SparklesIcon className="w-5 h-5 text-blue-400" />
                )}
                Forge Image
              </button>
            </section>
          )}

          <section>
            <h3 className="text-[10px] font-black text-white/30 uppercase tracking-widest mb-6 flex items-center gap-2">
              <CommandLineIcon className="w-4 h-4" /> System Health
            </h3>
            <div className="glass-card p-5 space-y-4">
              <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-tighter">
                <span className="opacity-40">Function Sync</span>
                <span className={hasApiKey ? "text-teal-400" : "text-red-400"}>{hasApiKey ? "HEALTHY" : "MISSING"}</span>
              </div>
              <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-tighter">
                <span className="opacity-40">Memory Pool</span>
                <span className="text-purple-400 italic">BURST READY</span>
              </div>
              <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-tighter">
                <span className="opacity-40">Aspect Lock</span>
                <span className="text-blue-400">1:1 STRICT</span>
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
              {activeTab === 'processor' ? 'Production Line' : 'AI Lab Canvas'}
              {(isProcessing || isGenerating) && <div className="w-3 h-3 bg-blue-500 rounded-full animate-ping shadow-[0_0_20px_rgba(59,130,246,0.8)]" />}
            </h2>
            <p className="text-[10px] font-bold text-white/30 uppercase tracking-[0.4em] mt-2">
              {activeTab === 'processor' ? 'Sequential Burst Mode • 1:1 HD Square' : 'Vercel Edge Rendering • 1K Resolution'}
            </p>
          </div>
          
          <div className="flex items-center gap-6">
            {images.length > 0 && !isProcessing && (
              <button onClick={clearAll} className="text-[10px] font-black text-white/40 uppercase tracking-widest hover:text-white transition-colors">
                Reset
              </button>
            )}
            
            <button 
              onClick={startProcessing}
              disabled={isProcessing || images.length === 0 || !brandLogo}
              className={`btn-glossy px-14 py-6 rounded-[24px] text-[11px] font-black uppercase tracking-[0.2em] flex items-center gap-4 transition-all ${
                isProcessing || images.length === 0 || !brandLogo
                ? 'opacity-20 grayscale cursor-not-allowed' 
                : 'shadow-2xl border-blue-500/50 bg-blue-600/10'
              }`}
            >
              {isProcessing ? 'Bursting...' : 'Start Branding'}
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto pr-2 custom-scroll">
          {activeTab === 'processor' ? (
            images.length === 0 ? (
              <div className="h-full glass rounded-[32px] flex flex-col items-center justify-center text-center p-20">
                <div className="w-32 h-32 glass-card flex items-center justify-center mb-10 shadow-2xl border border-white/5">
                  <Square3Stack3DIcon className="w-16 h-16 text-white/5" />
                </div>
                <h3 className="text-4xl font-black mb-6 tracking-tighter uppercase">No Assets</h3>
                <p className="text-white/20 font-bold max-w-sm mb-12 uppercase text-[10px] tracking-[0.5em]">
                  Optimized for Cloud Deployment • Sequential Burst Processing
                </p>
                <button 
                  onClick={() => galleryInputRef.current?.click()}
                  className="btn-glossy bg-white/95 text-black px-20 py-7 rounded-[28px] font-black text-xs uppercase tracking-widest shadow-2xl"
                >
                  Upload Batch
                </button>
              </div>
            ) : (
              <div className="space-y-6 pb-24">
                {isProcessing && (
                  <div className="glass p-12 rounded-[40px] mb-8 overflow-hidden relative shadow-2xl border-white/5">
                    <div className="grid grid-cols-2 gap-12">
                      <div>
                        <div className="flex justify-between items-end mb-4">
                          <span className="text-[10px] font-black uppercase tracking-[0.5em] text-white/30">Total Batch Progress</span>
                          <span className="text-2xl font-black text-blue-400 tabular-nums">{batchProgress}%</span>
                        </div>
                        <div className="h-4 bg-white/5 rounded-full overflow-hidden border border-white/10">
                          <div className="h-full bg-blue-500 rounded-full transition-all duration-700 shadow-[0_0_20px_rgba(59,130,246,0.3)]" style={{ width: `${batchProgress}%` }} />
                        </div>
                      </div>
                      <div>
                        <div className="flex justify-between items-end mb-4">
                          <span className="text-[10px] font-black uppercase tracking-[0.5em] text-white/30">Burst Load</span>
                          <span className="text-2xl font-black text-teal-400 tabular-nums">{processStates[currentIdx]?.progress || 0}%</span>
                        </div>
                        <div className="h-4 bg-white/5 rounded-full overflow-hidden border border-white/10">
                          <div className="h-full bg-teal-500 rounded-full transition-all duration-300" style={{ width: `${processStates[currentIdx]?.progress || 0}%` }} />
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {zipUrl && (
                  <div className="glass p-10 rounded-[40px] flex items-center justify-between bg-teal-500/10 border-teal-500/20 mb-8 animate-in slide-in-from-top-4">
                    <div className="flex items-center gap-6">
                      <div className="bg-teal-500 p-4 rounded-2xl"><ArrowDownTrayIcon className="w-8 h-8 text-white" /></div>
                      <div>
                        <h4 className="text-xl font-black tracking-tight uppercase italic">Cloud Package Ready</h4>
                        <p className="text-teal-300 text-[10px] font-black uppercase tracking-widest mt-1 opacity-70">
                          {images.length} HD Square Assets Packaged
                        </p>
                      </div>
                    </div>
                    <a href={zipUrl} download="VERCEL_HD_BATCH.zip" className="btn-glossy bg-white text-black px-12 py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl">
                      Download ZIP
                    </a>
                  </div>
                )}

                <div className="grid grid-cols-1 gap-3">
                  {images.map((file, idx) => {
                    const state = processStates[idx];
                    const isActive = currentIdx === idx;
                    const isFinished = state?.status === 'completed';
                    return (
                      <div key={`${file.name}-${idx}`} className={`glass-card p-5 flex items-center gap-6 transition-all duration-500 rounded-[24px] ${isActive ? 'bg-white/10 border-blue-500/30' : 'opacity-60'}`}>
                        <div className="w-16 h-16 glass rounded-xl shrink-0 flex items-center justify-center overflow-hidden border-white/10 shadow-inner">
                          {state?.resultUrl ? <img src={state.resultUrl} className="w-full h-full object-cover" /> : <PhotoIcon className="w-8 h-8 text-white/5" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-md font-black truncate uppercase tracking-tight ${isActive ? 'text-blue-300' : 'text-white/30'}`}>{file.name}</p>
                        </div>
                        <div className="w-32 flex justify-end shrink-0">
                          {isFinished ? <CheckCircleIcon className="w-6 h-6 text-teal-400" /> : isActive ? <div className="w-4 h-4 border-2 border-white/5 border-t-blue-400 rounded-full animate-spin" /> : <span className="text-[9px] font-black text-white/5 uppercase tracking-[0.4em]">Queue</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )
          ) : (
            <div className="h-full glass rounded-[32px] p-12 flex flex-col items-center justify-center animate-in fade-in duration-500 overflow-hidden relative">
              <div className="w-full max-w-xl aspect-square glass-card rounded-[40px] flex items-center justify-center relative overflow-hidden group shadow-[0_40px_100px_rgba(0,0,0,0.5)]">
                {generatedImage ? (
                  <>
                    <img src={generatedImage} className="w-full h-full object-contain p-8" alt="Generated" />
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-6">
                      <button onClick={addToQueue} className="bg-white text-black px-8 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center gap-2 hover:scale-105 transition-transform"><PlusIcon className="w-4 h-4" /> Add to Batch</button>
                    </div>
                  </>
                ) : isGenerating ? (
                  <div className="text-center space-y-4 animate-pulse">
                    <CpuChipIcon className="w-16 h-16 text-blue-400 mx-auto" />
                    <h4 className="text-xl font-black tracking-tighter uppercase italic">Edge Synthesizing...</h4>
                  </div>
                ) : (
                  <PaintBrushIcon className="w-20 h-20 text-white/10" />
                )}
              </div>
              <div className="absolute -top-20 -right-20 w-64 h-64 bg-blue-500/5 blur-[100px] pointer-events-none rounded-full" />
            </div>
          )}
        </div>
      </main>

      <input ref={galleryInputRef} type="file" multiple onChange={handleBulkUpload} className="hidden" accept="image/*" />
    </div>
  );
};

export default App;
