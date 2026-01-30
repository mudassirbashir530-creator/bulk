
import React, { useState, useRef, useEffect } from 'react';
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
  AdjustmentsHorizontalIcon,
  PaintBrushIcon,
  PlusIcon,
  KeyIcon,
  ArrowPathIcon,
  Square3Stack3DIcon
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
  const [batchSize, setBatchSize] = useState<number>(10);
  
  // Generative State
  const [activeTab, setActiveTab] = useState<'processor' | 'generator'>('processor');
  const [prompt, setPrompt] = useState('');
  const [selectedRatio, setSelectedRatio] = useState('1:1');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [hasApiKey, setHasApiKey] = useState(false);

  const galleryInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const checkKey = async () => {
      if (window.aistudio?.hasSelectedApiKey) {
        const selected = await window.aistudio.hasSelectedApiKey();
        setHasApiKey(selected);
      } else if (process.env.API_KEY) {
        setHasApiKey(true);
      }
    };
    checkKey();
  }, []);

  const handleSelectKey = async () => {
    if (window.aistudio?.openSelectKey) {
      await window.aistudio.openSelectKey();
      setHasApiKey(true); 
    }
  };

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

  const generateImage = async () => {
    if (!prompt) return;
    setIsGenerating(true);
    setGeneratedImage(null);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-3-pro-image-preview',
        contents: {
          parts: [{ text: prompt }],
        },
        config: {
          imageConfig: {
            aspectRatio: selectedRatio as any,
            imageSize: "1K"
          }
        },
      });

      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
          const base64 = `data:image/png;base64,${part.inlineData.data}`;
          setGeneratedImage(base64);
          break;
        }
      }
    } catch (error: any) {
      console.error("Generation error:", error);
      if (error.message?.includes("Requested entity was not found")) {
        setHasApiKey(false);
      }
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
    if (!process.env.API_KEY) {
      alert("System Error: GOOGLE_API_KEY is not configured in environment.");
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

    // Process in sequential chunks to manage memory and prevent UI lockup
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
        
        // Lazy load Base64 data only when needed
        const sourceBase64 = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target?.result as string);
          reader.readAsDataURL(file);
        });
        
        const placement = await getSmartLogoPosition(sourceBase64);
        updateStatus({ placement });
        
        updateStatus({ status: 'processing', progress: 60 });
        const { fullRes, thumb } = await processProductImage(sourceUrl, placement, {
          brandLogo: brandLogo,
          watermarkOpacity: 0.40,
          quality: 1.0, 
          logoPadding: logoPadding,
          forceSquare: true // Enforcement of user requirement for 1:1 aspect ratio
        });

        updateStatus({ status: 'processing', progress: 90 });
        const base64Content = fullRes.split(',')[1];
        zip.file(`${file.name.split('.')[0]}_1x1_HD.jpg`, base64Content, { base64: true });

        // Memory cleanup: only keep small thumb in state
        updateStatus({ 
          status: 'completed', 
          progress: 100, 
          resultUrl: thumb 
        });
        
        URL.revokeObjectURL(sourceUrl);
        
        // Artificial yield to browser main thread every N images to prevent hanging
        if (i % batchSize === 0) {
          await new Promise(r => setTimeout(r, 100));
        }

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
                  <SparklesIcon className="w-4 h-4" /> Brand Asset
                </h3>
                <div className="space-y-4">
                  <div className="relative glass-card p-6 group transition-all">
                    <label className="block text-[9px] font-black text-white/50 mb-4 uppercase tracking-wider">Master Logo (PNG/JPG)</label>
                    {brandLogo ? (
                      <div className="relative">
                        <img src={brandLogo} className="h-24 w-full object-contain drop-shadow-2xl" alt="Brand Logo" />
                        <button onClick={() => setBrandLogo(null)} className="absolute -top-4 -right-4 bg-red-500/80 p-2 rounded-full shadow-2xl hover:bg-red-500 transition-colors"><TrashIcon className="w-4 h-4 text-white"/></button>
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
                      <label className="text-[9px] font-black text-white/50 uppercase tracking-wider">Batch Burst Size</label>
                      <span className="text-[10px] font-black text-blue-400">{batchSize} units</span>
                    </div>
                    <input 
                      type="range" min="1" max="50" value={batchSize} 
                      onChange={(e) => setBatchSize(parseInt(e.target.value))}
                      className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-blue-500"
                    />
                    <p className="text-[7px] text-white/20 mt-3 uppercase tracking-widest italic font-bold">Optimized for Vercel/Memory</p>
                  </div>
                </div>
              </section>
            </>
          ) : (
            <section className="space-y-8">
              {!hasApiKey && (
                <div className="glass-card p-6 border-pink-500/20 bg-pink-500/5">
                  <h4 className="text-[10px] font-black text-pink-400 uppercase tracking-[0.2em] mb-3">Key Required</h4>
                  <p className="text-[10px] text-white/40 mb-6 font-medium leading-relaxed">
                    AI Lab requires a billing-active project key. 
                    <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" className="text-blue-400 block mt-2 hover:underline">Billing Docs →</a>
                  </p>
                  <button 
                    onClick={handleSelectKey}
                    className="w-full py-4 bg-white/90 text-black rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-white transition-all shadow-xl"
                  >
                    <KeyIcon className="w-4 h-4" /> Select API Key
                  </button>
                </div>
              )}

              <div>
                <h3 className="text-[10px] font-black text-white/30 uppercase tracking-widest mb-6 flex items-center gap-2">
                  <PaintBrushIcon className="w-4 h-4" /> Image Prompt
                </h3>
                <textarea 
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="A sleek e-commerce product shot of a luxury watch on a dark stone surface..."
                  className="w-full h-32 bg-white/5 border border-white/10 rounded-[20px] p-5 text-[11px] font-medium focus:ring-1 focus:ring-pink-500/50 focus:outline-none placeholder:text-white/10 custom-scroll"
                />
              </div>

              <div>
                <h3 className="text-[10px] font-black text-white/30 uppercase tracking-widest mb-6 flex items-center gap-2">
                  <ArrowPathIcon className="w-4 h-4" /> Aspect Ratio
                </h3>
                <div className="grid grid-cols-1 gap-3">
                  {ASPECT_RATIOS.map((ratio) => (
                    <button
                      key={ratio.value}
                      onClick={() => setSelectedRatio(ratio.value)}
                      className={`text-[9px] font-black uppercase tracking-widest py-3 px-4 rounded-xl border transition-all text-left flex justify-between items-center ${
                        selectedRatio === ratio.value 
                        ? 'border-pink-500/50 bg-pink-500/10 text-pink-300' 
                        : 'border-white/5 bg-white/5 text-white/30 hover:border-white/20'
                      }`}
                    >
                      {ratio.label}
                      {selectedRatio === ratio.value && <div className="w-1.5 h-1.5 bg-pink-500 rounded-full shadow-[0_0_8px_rgba(236,72,153,0.8)]" />}
                    </button>
                  ))}
                </div>
              </div>

              <button 
                onClick={generateImage}
                disabled={isGenerating || !prompt || !hasApiKey}
                className={`w-full py-6 rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] flex items-center justify-center gap-4 transition-all ${
                  isGenerating || !prompt || !hasApiKey
                  ? 'bg-white/5 text-white/20 cursor-not-allowed border border-white/5' 
                  : 'btn-glossy shadow-[0_20px_40px_rgba(0,0,0,0.3)]'
                }`}
              >
                {isGenerating ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                    Forging Image...
                  </>
                ) : (
                  <>
                    <SparklesIcon className="w-5 h-5 text-pink-400" />
                    Generate Asset
                  </>
                )}
              </button>
            </section>
          )}

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
                <span className="opacity-40">Aspect Lock</span>
                <span className="text-purple-400 italic">1:1 FORCED</span>
              </div>
              <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-tighter">
                <span className="opacity-40">Headless Sync</span>
                <span className="text-teal-400">ENABLED</span>
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
              {activeTab === 'processor' ? 'Production Floor' : 'AI Lab Canvas'}
              {(isProcessing || isGenerating) && <div className="w-3 h-3 bg-pink-500 rounded-full animate-ping shadow-[0_0_20px_rgba(236,72,153,0.8)]" />}
            </h2>
            <p className="text-[10px] font-bold text-white/30 uppercase tracking-[0.4em] mt-2">
              {activeTab === 'processor' ? 'Sequential Processing Active • 100% Quality' : 'Gemini 3 Pro Vision Model • 1K High Resolution'}
            </p>
          </div>
          
          <div className="flex items-center gap-6">
            {images.length > 0 && !isProcessing && activeTab === 'processor' && (
              <button onClick={clearAll} className="text-[10px] font-black text-white/40 uppercase tracking-widest hover:text-white transition-colors">
                Reset Gallery
              </button>
            )}
            
            {activeTab === 'processor' ? (
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
            ) : (
              <button 
                onClick={() => setActiveTab('processor')}
                className="text-[10px] font-black text-white/40 uppercase tracking-widest hover:text-white transition-colors flex items-center gap-2"
              >
                <QueueListIcon className="w-4 h-4" /> Go to Gallery
              </button>
            )}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto pr-2 custom-scroll">
          {activeTab === 'processor' ? (
            images.length === 0 ? (
              <div className="h-full glass rounded-[32px] flex flex-col items-center justify-center text-center p-20">
                <div className="w-32 h-32 glass-card flex items-center justify-center mb-10 shadow-2xl border border-white/5">
                  <Square3Stack3DIcon className="w-16 h-16 text-white/5" />
                </div>
                <h3 className="text-4xl font-black mb-6 tracking-tighter uppercase italic">Neutralized Deck</h3>
                <p className="text-white/20 font-bold max-w-sm mb-12 uppercase text-[10px] tracking-[0.5em]">
                  Optimized for Vercel • Batch Burst Logic • 1:1 Aspect Enforced
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
                {isProcessing && (
                  <div className="glass p-12 rounded-[40px] mb-8 overflow-hidden relative shadow-2xl border-white/5 animate-in zoom-in-95 duration-500">
                    <div className="grid grid-cols-2 gap-12 mb-10">
                      <div>
                        <div className="flex justify-between items-end mb-4">
                          <div className="flex flex-col">
                            <span className="text-[10px] font-black uppercase tracking-[0.5em] text-white/30 mb-1">Burst Operation</span>
                            <h4 className="text-xl font-black text-white/90 italic tracking-tighter">Asset {currentIdx + 1} of {images.length}</h4>
                          </div>
                          <span className="text-2xl font-black text-blue-400 tabular-nums">{batchProgress}%</span>
                        </div>
                        <div className="h-4 bg-white/5 rounded-full overflow-hidden border border-white/10 p-0.5">
                          <div className="h-full bg-gradient-to-r from-blue-600 to-blue-400 rounded-full transition-all duration-700 ease-out shadow-[0_0_20px_rgba(59,130,246,0.3)]" style={{ width: `${batchProgress}%` }} />
                        </div>
                      </div>
                      <div>
                        <div className="flex justify-between items-end mb-4">
                          <div className="flex flex-col">
                            <span className="text-[10px] font-black uppercase tracking-[0.5em] text-white/30 mb-1">Burst Load</span>
                            <h4 className="text-xl font-black text-pink-400 italic tracking-tighter">
                              {currentItem?.status === 'analyzing' ? 'Scene Vision...' : 'Forging 1:1 HD...'}
                            </h4>
                          </div>
                          <span className="text-2xl font-black text-pink-400 tabular-nums">{currentItem?.progress || 0}%</span>
                        </div>
                        <div className="h-4 bg-white/5 rounded-full overflow-hidden border border-white/10 p-0.5">
                          <div className="h-full bg-gradient-to-r from-pink-600 to-pink-400 rounded-full transition-all duration-300 ease-out shadow-[0_0_20px_rgba(236,72,153,0.3)]" style={{ width: `${currentItem?.progress || 0}%` }} />
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {zipUrl && (
                  <div className="glass p-14 rounded-[40px] flex items-center justify-between border-teal-500/20 bg-teal-500/5 mb-8 animate-in slide-in-from-top-12 duration-1000 shadow-[0_40px_100px_rgba(0,0,0,0.5)]">
                    <div className="flex items-center gap-10">
                      <div className="bg-white/95 p-8 rounded-[32px] shadow-2xl">
                        <ArrowDownTrayIcon className="w-16 h-16 text-teal-600" />
                      </div>
                      <div>
                        <h4 className="text-4xl font-black tracking-tighter italic">FORGE COMPLETE</h4>
                        <p className="text-teal-300 text-[11px] font-black uppercase tracking-[0.5em] mt-3 opacity-70">
                          {images.length} SQUARE 1:1 HD FILES EXPORTED
                        </p>
                      </div>
                    </div>
                    <a href={zipUrl} download="HD_SQUARE_PRODUCTION.zip" className="btn-glossy bg-teal-500 text-white px-20 py-8 rounded-[30px] font-black text-sm uppercase tracking-[0.2em] shadow-2xl">
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
                      <div key={`${file.name}-${idx}`} className={`glass-card p-5 flex items-center gap-6 transition-all duration-500 rounded-[24px] ${isActive ? 'bg-white/10 scale-[1.01] border-pink-500/30 shadow-[0_20px_40px_rgba(236,72,153,0.15)] ring-1 ring-pink-500/20' : isFinished ? 'opacity-80 border-teal-500/10' : 'opacity-40 grayscale-[0.5]'}`}>
                        <div className={`w-20 h-20 glass rounded-[18px] shrink-0 flex items-center justify-center overflow-hidden border-white/10 shadow-inner relative group`}>
                          {state?.resultUrl ? (
                            <img src={state.resultUrl} className="w-full h-full object-cover" />
                          ) : isActive ? (
                            <div className="w-8 h-8 border-3 border-white/5 border-t-pink-400 rounded-full animate-spin" />
                          ) : (
                            <PhotoIcon className="w-8 h-8 text-white/5" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-md font-black truncate uppercase tracking-tight ${isActive ? 'text-pink-300' : isFinished ? 'text-white/70' : 'text-white/30'}`}>{file.name}</p>
                          {isActive && (
                            <div className="mt-2 flex items-center gap-3">
                              <div className="flex-1 h-1 bg-white/5 rounded-full overflow-hidden"><div className="h-full bg-pink-500" style={{ width: `${state.progress}%` }} /></div>
                              <span className="text-[8px] font-black text-pink-400 uppercase italic animate-pulse">{state.status}</span>
                            </div>
                          )}
                        </div>
                        <div className="w-32 flex justify-end shrink-0">
                          {isFinished ? <span className="text-[9px] font-black text-teal-400 uppercase tracking-[0.3em]">1:1 Square</span> : isActive ? <span className="text-[9px] font-black text-pink-400 uppercase tracking-[0.4em] animate-pulse italic">Bursting</span> : <span className="text-[9px] font-black text-white/5 uppercase tracking-[0.4em]">Standby</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )
          ) : (
            <div className="h-full glass rounded-[32px] p-12 flex flex-col items-center justify-center animate-in fade-in duration-500 overflow-hidden relative">
              <div className="w-full max-w-2xl aspect-square glass-card rounded-[40px] flex items-center justify-center relative overflow-hidden group shadow-[0_40px_100px_rgba(0,0,0,0.5)]">
                {generatedImage ? (
                  <>
                    <img src={generatedImage} className="w-full h-full object-contain p-4" alt="Generated" />
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-6">
                      <button 
                        onClick={addToQueue}
                        className="bg-white text-black px-8 py-4 rounded-[20px] font-black text-[10px] uppercase tracking-widest flex items-center gap-2 hover:scale-105 transition-transform"
                      >
                        <PlusIcon className="w-4 h-4" /> Add to Queue
                      </button>
                      <button 
                        onClick={() => setGeneratedImage(null)}
                        className="bg-red-500 text-white px-8 py-4 rounded-[20px] font-black text-[10px] uppercase tracking-widest flex items-center gap-2 hover:scale-105 transition-transform"
                      >
                        <TrashIcon className="w-4 h-4" /> Discard
                      </button>
                    </div>
                  </>
                ) : isGenerating ? (
                  <div className="text-center space-y-8 animate-pulse">
                    <div className="w-24 h-24 bg-pink-500/10 rounded-[30px] flex items-center justify-center mx-auto border border-pink-500/20">
                      <CpuChipIcon className="w-12 h-12 text-pink-400" />
                    </div>
                    <div>
                      <h4 className="text-xl font-black tracking-tighter uppercase italic">Synthesizing Vision...</h4>
                      <p className="text-[9px] font-black text-white/20 uppercase tracking-[0.5em] mt-3">Headless Logic Processing</p>
                    </div>
                  </div>
                ) : (
                  <div className="text-center space-y-6 opacity-30">
                    <PaintBrushIcon className="w-20 h-20 mx-auto text-white" />
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.6em]">Awaiting Instruction</p>
                      <p className="text-[8px] font-bold text-white/50 uppercase tracking-widest mt-2 italic">1K Production Standard</p>
                    </div>
                  </div>
                )}
              </div>
              <div className="absolute -top-20 -right-20 w-64 h-64 bg-pink-500/10 blur-[100px] pointer-events-none rounded-full" />
              <div className="absolute -bottom-20 -left-20 w-64 h-64 bg-blue-500/10 blur-[100px] pointer-events-none rounded-full" />
            </div>
          )}
        </div>
      </main>

      <input ref={galleryInputRef} type="file" multiple onChange={handleBulkUpload} className="hidden" accept="image/*" />
    </div>
  );
};

export default App;
