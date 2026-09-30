import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Camera,
  Barcode,
  Edit3,
  Upload,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  Layers,
  Calendar,
  ScanLine,
  Image as ImageIcon,
  Check,
  RotateCcw,
  ArrowRight
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { aiApi, foodsApi, zonesApi, datasetApi } from '../services/api';
import { Zone, PredictionResponse, BarcodeProduct } from '../types';
import { useNotification } from '../context/NotificationContext';

export const AddFood: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'fruit_scan' | 'barcode_scan' | 'manual'>('fruit_scan');
  const [zones, setZones] = useState<Zone[]>([]);
  const [loading, setLoading] = useState(false);
  const { showToast } = useNotification();
  const navigate = useNavigate();

  // Fruit scan state
  const [fruitImageFile, setFruitImageFile] = useState<File | null>(null);
  const [fruitImagePreview, setFruitImagePreview] = useState<string | null>(null);
  const [prediction, setPrediction] = useState<PredictionResponse | null>(null);
  const [selectedItemName, setSelectedItemName] = useState<string>('');
  const [selectedFreshness, setSelectedFreshness] = useState<string>('Fresh');
  const [adjustedExpiryDate, setAdjustedExpiryDate] = useState<string>('');
  const [targetZoneId, setTargetZoneId] = useState<number>(1);
  const [quantity, setQuantity] = useState<number>(1);
  const [unit, setUnit] = useState<string>('pcs');

  // Barcode scan state
  const [barcodeInput, setBarcodeInput] = useState<string>('');
  const [barcodeProduct, setBarcodeProduct] = useState<BarcodeProduct | null>(null);
  const [barcodeExpiryDate, setBarcodeExpiryDate] = useState<string>('');
  const [isScanningLive, setIsScanningLive] = useState<boolean>(false);
  const [ocrLoading, setOcrLoading] = useState<boolean>(false);

  // Manual input state
  const [manualName, setManualName] = useState('');
  const [manualCategory, setManualCategory] = useState('Dairy');
  const [manualItemType, setManualItemType] = useState<'fruit' | 'vegetable' | 'packaged'>('packaged');
  const [manualQuantity, setManualQuantity] = useState(1);
  const [manualUnit, setManualUnit] = useState('pack');
  const [manualExpiry, setManualExpiry] = useState('');
  const [manualZoneId, setManualZoneId] = useState(2);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const ocrInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    zonesApi.getAll().then((data) => {
      setZones(data);
      if (data.length > 0) {
        setTargetZoneId(data[0].id);
        setManualZoneId(data[0].id);
      }
    });

    // Default expiry today + 7 days
    const def = new Date();
    def.setDate(def.getDate() + 7);
    setManualExpiry(def.toISOString().split('T')[0]);
  }, []);

  // --- Fruit / Veg Scan Handlers ---
  const handleFruitPhotoSelect = async (file: File) => {
    setFruitImageFile(file);
    setFruitImagePreview(URL.createObjectURL(file));
    setLoading(true);
    try {
      const res = await aiApi.predictFreshness(file);
      setPrediction(res);
      const top = res.top_prediction;
      setSelectedItemName(top.item_name);
      setSelectedFreshness(top.freshness_class);
      setAdjustedExpiryDate(new Date(top.suggested_expiry_date).toISOString().split('T')[0]);
      setTargetZoneId(top.suggested_zone_id);
      showToast('success', `Detected ${top.item_name} (${top.freshness_class})`, 'AI Prediction Ready');
    } catch (err) {
      console.error(err);
      showToast('error', 'Failed to predict image freshness');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmFruitSave = async () => {
    if (!selectedItemName) return;
    setLoading(true);
    try {
      // 1. Save food item
      const expiry = adjustedExpiryDate ? new Date(adjustedExpiryDate).toISOString() : new Date().toISOString();
      await foodsApi.create({
        name: selectedItemName,
        category: prediction?.top_prediction.category || 'Fruits',
        item_type: prediction?.top_prediction.item_type || 'fruit',
        zone_id: targetZoneId,
        quantity,
        unit,
        expiry_date: expiry,
        freshness_status: selectedFreshness,
        image_path: prediction?.image_url,
        source: 'fruit_scan'
      });

      // 2. Submit feedback if user corrected label
      if (prediction && (selectedItemName !== prediction.top_prediction.item_name || selectedFreshness !== prediction.top_prediction.freshness_class)) {
        await datasetApi.submitFeedback({
          correct_item_name: selectedItemName,
          correct_freshness: selectedFreshness,
          image_path: prediction.image_url
        });
      }

      confetti({ particleCount: 80, spread: 60, origin: { y: 0.6 } });
      showToast('success', `${selectedItemName} added to ${zones.find(z => z.id === targetZoneId)?.name}!`, 'Item Stored');
      setTimeout(() => navigate('/'), 1000);
    } catch (err) {
      showToast('error', 'Failed to save item');
    } finally {
      setLoading(false);
    }
  };

  // --- Barcode Handlers ---
  const handleBarcodeLookup = async (code: string) => {
    if (!code) return;
    setLoading(true);
    try {
      const prod = await aiApi.lookupBarcode(code);
      setBarcodeProduct(prod);
      setBarcodeExpiryDate(new Date(prod.suggested_expiry_date).toISOString().split('T')[0]);
      setTargetZoneId(prod.suggested_zone_id);
      showToast('success', `Found: ${prod.name} (${prod.brand || 'Generic'})`, 'Product Verified');
    } catch (err) {
      showToast('error', 'Could not find product for barcode');
    } finally {
      setLoading(false);
    }
  };

  const handleOcrExpiryUpload = async (file: File) => {
    setOcrLoading(true);
    try {
      const res = await aiApi.ocrExpiry(file);
      if (res.expiry_date) {
        setBarcodeExpiryDate(new Date(res.expiry_date).toISOString().split('T')[0]);
        showToast('success', `OCR Expiry Date: ${res.detected_text}`, 'Date Extracted');
      } else {
        showToast('info', 'Could not parse date text, please enter manually.');
      }
    } catch (err) {
      showToast('error', 'OCR failed on label photo');
    } finally {
      setOcrLoading(false);
    }
  };

  const handleConfirmBarcodeSave = async () => {
    if (!barcodeProduct) return;
    setLoading(true);
    try {
      const expiry = barcodeExpiryDate ? new Date(barcodeExpiryDate).toISOString() : new Date().toISOString();
      await foodsApi.create({
        name: barcodeProduct.name,
        category: barcodeProduct.category,
        item_type: 'packaged',
        zone_id: targetZoneId,
        quantity: 1,
        unit: barcodeProduct.quantity_str || 'pack',
        expiry_date: expiry,
        freshness_status: 'Fresh',
        barcode: barcodeProduct.barcode,
        brand: barcodeProduct.brand,
        image_path: barcodeProduct.image_url,
        source: 'barcode_scan'
      });

      confetti({ particleCount: 80, spread: 60, origin: { y: 0.6 } });
      showToast('success', `${barcodeProduct.name} saved to fridge!`);
      setTimeout(() => navigate('/'), 1000);
    } catch (err) {
      showToast('error', 'Failed to store barcode product');
    } finally {
      setLoading(false);
    }
  };

  // --- Manual Save Handler ---
  const handleManualSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualName) return;
    setLoading(true);
    try {
      await foodsApi.create({
        name: manualName,
        category: manualCategory,
        item_type: manualItemType,
        zone_id: manualZoneId,
        quantity: manualQuantity,
        unit: manualUnit,
        expiry_date: new Date(manualExpiry).toISOString(),
        freshness_status: 'Fresh',
        source: 'manual'
      });
      confetti({ particleCount: 70, spread: 50, origin: { y: 0.6 } });
      showToast('success', `${manualName} saved to pantry!`);
      setTimeout(() => navigate('/'), 1000);
    } catch (err) {
      showToast('error', 'Failed to add food item');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
          <Sparkles className="w-6 h-6 text-emerald-600" />
          Add Food & AI Recognition
        </h1>
        <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
          Scan fresh produce using computer vision, lookup packaged barcodes, or enter manually
        </p>
      </div>

      {/* Tabs */}
      <div className="flex p-1.5 bg-slate-100 rounded-2xl border border-slate-200">
        <button
          onClick={() => setActiveTab('fruit_scan')}
          className={`flex-1 py-2.5 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-all ${
            activeTab === 'fruit_scan'
              ? 'bg-white text-emerald-700 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Camera className="w-4 h-4" />
          Scan Fruit / Veg (AI)
        </button>

        <button
          onClick={() => setActiveTab('barcode_scan')}
          className={`flex-1 py-2.5 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-all ${
            activeTab === 'barcode_scan'
              ? 'bg-white text-emerald-700 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Barcode className="w-4 h-4" />
          Scan Barcode (OFF)
        </button>

        <button
          onClick={() => setActiveTab('manual')}
          className={`flex-1 py-2.5 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-all ${
            activeTab === 'manual'
              ? 'bg-white text-emerald-700 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Edit3 className="w-4 h-4" />
          Manual Entry
        </button>
      </div>

      {/* TAB 1: FRUIT & VEGETABLE AI RECOGNITION */}
      {activeTab === 'fruit_scan' && (
        <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200/80 shadow-soft space-y-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-base font-bold text-slate-800">
                Freshness AI Classifier (MobileNetV2)
              </h2>
              <p className="text-xs text-slate-500">
                Upload or capture a photo of produce. The model predicts item type and freshness stage.
              </p>
            </div>
            {prediction?.is_demo_mode && (
              <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                Intelligent Vision Engine
              </span>
            )}
          </div>

          {/* Upload Dropzone */}
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-slate-300 hover:border-emerald-500 rounded-2xl p-8 text-center cursor-pointer transition-all bg-slate-50/50 hover:bg-emerald-50/20 group"
          >
            <input
              type="file"
              ref={fileInputRef}
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFruitPhotoSelect(f);
              }}
            />

            {fruitImagePreview ? (
              <div className="flex flex-col items-center gap-3">
                <img
                  src={fruitImagePreview}
                  alt="Produce Preview"
                  className="w-40 h-40 object-cover rounded-2xl shadow-md border-2 border-white ring-2 ring-emerald-500"
                />
                <span className="text-xs font-semibold text-emerald-600 flex items-center gap-1 group-hover:underline">
                  <RotateCcw className="w-3.5 h-3.5" /> Click to choose a different photo
                </span>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2.5">
                <div className="w-14 h-14 rounded-2xl bg-emerald-100/70 text-emerald-600 flex items-center justify-center transition-transform group-hover:scale-110">
                  <Camera className="w-7 h-7 stroke-[2.2]" />
                </div>
                <p className="text-sm font-bold text-slate-800">
                  Take photo with camera or upload image
                </p>
                <p className="text-xs text-slate-400">
                  Supports Apple, Banana, Tomato, Strawberry, Capsicum, Chilli, Coriander, Carrot, Lychee
                </p>
              </div>
            )}
          </div>

          {/* Prediction Results & Confirmation Panel */}
          {loading && (
            <div className="p-6 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center gap-3">
              <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
              <span className="text-xs font-bold text-slate-600">Analyzing freshness textures & ripeness...</span>
            </div>
          )}

          {prediction && !loading && (
            <div className="p-6 rounded-2xl bg-gradient-to-br from-emerald-50/60 to-slate-50 border border-emerald-200/80 space-y-5 animate-in fade-in duration-300">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-emerald-600" />
                  <h3 className="text-sm font-bold text-slate-900">
                    AI Prediction: {prediction.top_prediction.item_name} ({prediction.top_prediction.freshness_class})
                  </h3>
                </div>
                <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                  {Math.round(prediction.top_prediction.confidence * 100)}% Confidence
                </span>
              </div>

              {prediction.top_prediction.needs_manual_check && (
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                  <span>Confidence below 60%. Please verify or adjust the detected item and freshness stage below.</span>
                </div>
              )}

              {/* Form Controls to Confirm or Correct */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Food Item Name (Verify / Correct)
                  </label>
                  <input
                    type="text"
                    value={selectedItemName}
                    onChange={(e) => setSelectedItemName(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs sm:text-sm bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Freshness Class
                  </label>
                  <select
                    value={selectedFreshness}
                    onChange={(e) => setSelectedFreshness(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs sm:text-sm bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  >
                    <option value="Fresh">Fresh (Full Shelf Life)</option>
                    <option value="Ripe">Ripe (Use within 3-4 days)</option>
                    <option value="Overripe">Overripe (Use in 1-2 days)</option>
                    <option value="Rotten">Rotten (Do not store / Remove)</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Recommended Shelf Zone
                  </label>
                  <select
                    value={targetZoneId}
                    onChange={(e) => setTargetZoneId(parseInt(e.target.value, 10))}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs sm:text-sm bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  >
                    {zones.map((z) => (
                      <option key={z.id} value={z.id}>
                        {z.name} ({z.code})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Estimated Expiry Date
                  </label>
                  <input
                    type="date"
                    value={adjustedExpiryDate}
                    onChange={(e) => setAdjustedExpiryDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs sm:text-sm bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">Quantity</label>
                    <input
                      type="number"
                      min="0.1"
                      step="0.5"
                      value={quantity}
                      onChange={(e) => setQuantity(parseFloat(e.target.value) || 1)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs sm:text-sm bg-white"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">Unit</label>
                    <input
                      type="text"
                      value={unit}
                      onChange={(e) => setUnit(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs sm:text-sm bg-white"
                    />
                  </div>
                </div>
              </div>

              {/* Confirm & Save Button */}
              <div className="pt-3 border-t border-slate-200/60 flex items-center justify-between">
                <p className="text-[11px] text-slate-500 italic max-w-sm">
                  {prediction.disclaimer}
                </p>
                <button
                  onClick={handleConfirmFruitSave}
                  className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs sm:text-sm px-6 py-2.5 rounded-xl shadow-md shadow-emerald-500/20 transition-all active:scale-95"
                >
                  <Check className="w-4 h-4 stroke-[3]" />
                  Confirm & Store in Fridge
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: BARCODE SCANNING (Open Food Facts + OCR Expiry) */}
      {activeTab === 'barcode_scan' && (
        <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200/80 shadow-soft space-y-6">
          <div className="border-b border-slate-100 pb-4">
            <h2 className="text-base font-bold text-slate-800">
              Barcode Scanner & Open Food Facts Database
            </h2>
            <p className="text-xs text-slate-500">
              Packaged foods (milk, curd, paneer, juice) are tracked by expiry date and barcode details.
            </p>
          </div>

          {/* Barcode Search / Scan Interface */}
          <div className="space-y-4">
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Scan or enter packaging barcode (e.g. 8901030382725)..."
                value={barcodeInput}
                onChange={(e) => setBarcodeInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleBarcodeLookup(barcodeInput)}
                className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-xs sm:text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              />
              <button
                onClick={() => handleBarcodeLookup(barcodeInput)}
                disabled={loading || !barcodeInput}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-bold shadow-xs transition-colors flex items-center gap-1.5"
              >
                <ScanLine className="w-4 h-4" />
                Lookup
              </button>
            </div>

            {/* Quick Demo Barcode Buttons */}
            <div>
              <p className="text-[11px] font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">
                Or click sample barcodes to test:
              </p>
              <div className="flex flex-wrap gap-2">
                {[
                  { label: 'Amul Milk', code: '8901030382725' },
                  { label: 'Mother Dairy Curd', code: '8901262010052' },
                  { label: 'Britannia Paneer', code: '8901491101835' },
                  { label: 'Oreo Biscuits', code: '7622201736209' },
                  { label: 'Orange Juice', code: '8901058852460' },
                ].map((item) => (
                  <button
                    key={item.code}
                    onClick={() => {
                      setBarcodeInput(item.code);
                      handleBarcodeLookup(item.code);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs text-slate-700 font-medium transition-colors"
                  >
                    {item.label} ({item.code.slice(-4)})
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Barcode Product Card Confirmation */}
          {barcodeProduct && (
            <div className="p-6 rounded-2xl bg-slate-50 border border-slate-200 space-y-4 animate-in fade-in duration-300">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-200/70 pb-3">
                <div>
                  <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md uppercase tracking-wider">
                    {barcodeProduct.category}
                  </span>
                  <h3 className="text-base font-bold text-slate-900 mt-1">
                    {barcodeProduct.name}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Brand: <strong>{barcodeProduct.brand || 'Generic'}</strong> • Barcode:{' '}
                    {barcodeProduct.barcode}
                  </p>
                </div>
                {barcodeProduct.nutri_score && (
                  <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white font-black text-lg flex items-center justify-center uppercase shadow-xs">
                    {barcodeProduct.nutri_score}
                  </div>
                )}
              </div>

              {/* Expiry Date Section + Optional OCR */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Expiry Date (Default: +{barcodeProduct.default_shelf_life_days}d)
                  </label>
                  <input
                    type="date"
                    value={barcodeExpiryDate}
                    onChange={(e) => setBarcodeExpiryDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs sm:text-sm bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    required
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Assign Storage Shelf
                  </label>
                  <select
                    value={targetZoneId}
                    onChange={(e) => setTargetZoneId(parseInt(e.target.value, 10))}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs sm:text-sm bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  >
                    {zones.map((z) => (
                      <option key={z.id} value={z.id}>
                        {z.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* OCR Expiry Label Photo Scanner Feature */}
              <div className="p-3.5 rounded-xl bg-white border border-slate-200 flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-slate-800">
                    Scan Expiry Date from Package Label Photo (OCR)
                  </p>
                  <p className="text-[11px] text-slate-400">
                    Takes photo of label stamped "EXP / BEST BEFORE" and autofills date
                  </p>
                </div>
                <input
                  type="file"
                  ref={ocrInputRef}
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleOcrExpiryUpload(f);
                  }}
                />
                <button
                  type="button"
                  disabled={ocrLoading}
                  onClick={() => ocrInputRef.current?.click()}
                  className="px-3 py-1.5 rounded-lg border border-emerald-300 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 text-xs font-semibold flex items-center gap-1.5 transition-colors"
                >
                  <Camera className="w-3.5 h-3.5" />
                  {ocrLoading ? 'Reading...' : 'Scan Label'}
                </button>
              </div>

              {/* Save Button */}
              <div className="pt-2 flex justify-end">
                <button
                  onClick={handleConfirmBarcodeSave}
                  disabled={loading}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs sm:text-sm px-6 py-2.5 rounded-xl shadow-md shadow-emerald-500/20 transition-all flex items-center gap-2"
                >
                  <Check className="w-4 h-4 stroke-[3]" />
                  Save to Inventory
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: MANUAL ENTRY */}
      {activeTab === 'manual' && (
        <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200/80 shadow-soft">
          <div className="border-b border-slate-100 pb-4 mb-5">
            <h2 className="text-base font-bold text-slate-800">Manual Food Registration</h2>
            <p className="text-xs text-slate-500">
              Manually log homemade leftovers, deli items, or custom groceries
            </p>
          </div>

          <form onSubmit={handleManualSave} className="space-y-4">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Food Item Name</label>
              <input
                type="text"
                placeholder="e.g. Cooked Chicken Curry, Leftover Rice, Organic Berries..."
                value={manualName}
                onChange={(e) => setManualName(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-xs sm:text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Category</label>
                <select
                  value={manualCategory}
                  onChange={(e) => setManualCategory(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-xs sm:text-sm bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                >
                  <option value="Dairy">Dairy</option>
                  <option value="Fruits">Fruits</option>
                  <option value="Vegetables">Vegetables</option>
                  <option value="Leftovers">Leftovers</option>
                  <option value="Meat/Seafood">Meat/Seafood</option>
                  <option value="Beverages">Beverages</option>
                  <option value="Packaged">Packaged</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Item Type</label>
                <select
                  value={manualItemType}
                  onChange={(e) => setManualItemType(e.target.value as any)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-xs sm:text-sm bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                >
                  <option value="packaged">Packaged / Prepared</option>
                  <option value="fruit">Fresh Fruit</option>
                  <option value="vegetable">Fresh Vegetable</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Quantity</label>
                <input
                  type="number"
                  min="0.1"
                  step="0.5"
                  value={manualQuantity}
                  onChange={(e) => setManualQuantity(parseFloat(e.target.value) || 1)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-xs sm:text-sm"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Unit</label>
                <input
                  type="text"
                  value={manualUnit}
                  onChange={(e) => setManualUnit(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-xs sm:text-sm"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Storage Shelf</label>
                <select
                  value={manualZoneId}
                  onChange={(e) => setManualZoneId(parseInt(e.target.value, 10))}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-xs sm:text-sm bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                >
                  {zones.map((z) => (
                    <option key={z.id} value={z.id}>
                      {z.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Expiry Date</label>
                <input
                  type="date"
                  value={manualExpiry}
                  onChange={(e) => setManualExpiry(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-xs sm:text-sm bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  required
                />
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100 flex justify-end">
              <button
                type="submit"
                disabled={loading}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs sm:text-sm px-6 py-2.5 rounded-xl shadow-md shadow-emerald-500/20 transition-all flex items-center gap-2"
              >
                <Check className="w-4 h-4 stroke-[3]" />
                Add to Refrigerator
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
