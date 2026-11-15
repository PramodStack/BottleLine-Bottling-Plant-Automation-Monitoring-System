import React, { useState, useEffect } from 'react';
import { X, Layers, Target, Infinity as InfinityIcon, Calendar, Clock, CheckCircle2, Lock, AlertCircle, Package } from 'lucide-react';
import { api, BatchData } from '../../services/api';
import { GlassButton } from '../common/GlassButton';

export interface NewBatchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  editBatch?: BatchData | null;
}

export const NewBatchModal: React.FC<NewBatchModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  editBatch,
}) => {
  const isEditing = Boolean(editBatch);

  const [batchNumber, setBatchNumber] = useState('');
  const [autoBatchId, setAutoBatchId] = useState('BATCH-001');
  const [productionMode, setProductionMode] = useState<'continuous' | 'set_quantity'>('continuous');
  const [targetQuantity, setTargetQuantity] = useState<number | string>(999);
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize form state whenever modal opens or editBatch changes
  useEffect(() => {
    if (!isOpen) return;

    setError(null);

    if (editBatch) {
      setBatchNumber(editBatch.batch_number);
      const isSetQty = editBatch.production_mode === 'set_quantity' || (editBatch.target_quantity !== null && Number(editBatch.target_quantity) > 0);
      setProductionMode(isSetQty ? 'set_quantity' : 'continuous');
      
      const existingTarget = editBatch.target_quantity && Number(editBatch.target_quantity) > 0
        ? Number(editBatch.target_quantity)
        : 999;
      setTargetQuantity(existingTarget);

      if (editBatch.scheduled_start) {
        try {
          const dt = new Date(editBatch.scheduled_start);
          if (!isNaN(dt.getTime())) {
            const yyyy = dt.getFullYear();
            const mm = String(dt.getMonth() + 1).padStart(2, '0');
            const dd = String(dt.getDate()).padStart(2, '0');
            const hh = String(dt.getHours()).padStart(2, '0');
            const min = String(dt.getMinutes()).padStart(2, '0');
            setScheduledDate(`${yyyy}-${mm}-${dd}`);
            setScheduledTime(`${hh}:${min}`);
          }
        } catch {
          setScheduledDate('');
          setScheduledTime('');
        }
      } else {
        setScheduledDate('');
        setScheduledTime('');
      }
    } else {
      // Create mode
      setBatchNumber('');
      setProductionMode('continuous');
      setTargetQuantity(999);
      setScheduledDate('');
      setScheduledTime('');

      // Fetch next auto batch ID preview
      api.getNextBatchNumber()
        .then((res) => {
          if (res.success && res.next_batch_number) {
            setAutoBatchId(res.next_batch_number);
          }
        })
        .catch(() => {});
    }
  }, [isOpen, editBatch]);

  if (!isOpen) return null;

  // Scheduling is only supported if creating a new batch, or editing a batch that hasn't started yet
  const isScheduleSupported = !isEditing || (editBatch?.batch_status === 'Scheduled' || editBatch?.batch_status === 'Pending');

  const parsedTarget = parseInt(String(targetQuantity), 10);
  const isValidTargetNum = !isNaN(parsedTarget) && parsedTarget > 0;
  const isMultipleOf3 = isValidTargetNum && parsedTarget % 3 === 0;
  const boxesCount = isMultipleOf3 ? parsedTarget / 3 : 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validate Target Quantity for Set Quantity mode
    let targetNum: number | null = null;
    if (productionMode === 'set_quantity') {
      if (!isValidTargetNum) {
        setError('Please enter a valid target quantity greater than 0.');
        return;
      }
      if (parsedTarget % 3 !== 0) {
        const suggested = Math.ceil(parsedTarget / 3) * 3;
        setError(
          `Target quantity (${parsedTarget}) must be a multiple of 3 to match box size (3 bottles per box). Suggested: ${suggested} bottles (${suggested / 3} boxes).`
        );
        return;
      }
      if (isEditing && editBatch && parsedTarget < (editBatch.produced_quantity || 0)) {
        setError(
          `Target quantity (${parsedTarget}) cannot be less than already produced units (${editBatch.produced_quantity}).`
        );
        return;
      }
      targetNum = parsedTarget;
    }

    // Construct scheduled_start string if supported and provided
    let scheduledStartStr: string | null = null;
    if (isScheduleSupported && scheduledDate) {
      const timeVal = scheduledTime ? scheduledTime : '00:00';
      scheduledStartStr = `${scheduledDate}T${timeVal}:00`;
    }

    setLoading(true);

    try {
      if (isEditing && editBatch) {
        const res = await api.updateProductionBatch(editBatch.id, {
          production_mode: productionMode,
          target_quantity: productionMode === 'set_quantity' ? targetNum : null,
          scheduled_start: isScheduleSupported ? scheduledStartStr : undefined,
        });

        if (res.success) {
          onSuccess();
          onClose();
        } else {
          setError(res.message || 'Failed to update production batch.');
        }
      } else {
        const res = await api.createProductionBatch({
          batch_number: batchNumber.trim() || undefined,
          production_mode: productionMode,
          target_quantity: productionMode === 'set_quantity' ? targetNum : null,
          scheduled_start: scheduledStartStr,
        });

        if (res.success) {
          onSuccess();
          onClose();
        } else {
          setError(res.message || 'Failed to create production batch.');
        }
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred while saving the batch.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-fade-in select-none">
      <div className="relative w-full max-w-lg p-6 rounded-3xl glass-panel-elevated shadow-[0_20px_60px_rgba(0,0,0,0.7)] border border-[rgba(255,255,255,0.14)] max-h-[92vh] overflow-y-auto scrollbar-none">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-[rgba(255,255,255,0.1)]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[rgba(83,211,226,0.18)] border border-[rgba(83,211,226,0.35)] flex items-center justify-center text-[#53D3E2] shadow-[0_0_12px_rgba(83,211,226,0.2)]">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white tracking-wide">
                {isEditing ? `Edit Batch — ${editBatch?.batch_number}` : 'Create New Batch'}
              </h3>
              <p className="text-[11px] text-[#cbd5e1]">
                {isEditing
                  ? 'Update production mode and targets'
                  : 'Register and schedule a new bottling production batch'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full flex items-center justify-center text-[#cbd5e1] hover:text-white hover:bg-[rgba(255,255,255,0.1)] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Error Notice */}
        {error && (
          <div className="mt-3 p-3 rounded-xl bg-[rgba(239,68,68,0.18)] border border-[rgba(239,68,68,0.35)] text-red-200 text-xs flex items-center gap-2 animate-shake">
            <AlertCircle className="w-4 h-4 flex-shrink-0 text-red-400" />
            <span>{error}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          
          {/* A. Batch Identifier */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-white uppercase tracking-wider">
                Batch Identifier
              </label>
              {isEditing && (
                <span className="text-[10px] text-[#94a3b8] flex items-center gap-1 font-medium">
                  <Lock className="w-3 h-3 text-[#53D3E2]" /> Preserved during edit
                </span>
              )}
            </div>
            <div className="relative">
              <input
                type="text"
                value={batchNumber}
                onChange={(e) => setBatchNumber(e.target.value)}
                disabled={isEditing}
                placeholder={`e.g. ${autoBatchId} (Leave blank for auto-generation)`}
                className={`w-full px-3.5 py-2.5 text-xs rounded-xl border transition-all ${
                  isEditing
                    ? 'bg-[rgba(30,41,59,0.55)] border-[rgba(255,255,255,0.08)] text-[#94a3b8] cursor-not-allowed'
                    : 'bg-[rgba(55,78,102,0.45)] border-[rgba(215,232,248,0.22)] text-white placeholder-[#94A3B8] outline-none focus:border-[#53D3E2] focus:ring-1 focus:ring-[#53D3E2]/40'
                }`}
              />
            </div>
            {!isEditing && (
              <p className="text-[10px] text-[#94a3b8] mt-1">
                Leave empty to automatically assign <span className="text-[#53D3E2] font-semibold">{autoBatchId}</span>.
              </p>
            )}
          </div>

          {/* B. Production Mode Selector */}
          <div>
            <label className="block text-xs font-bold text-white mb-2 uppercase tracking-wider">
              Production Mode
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              
              {/* Option 1: Continuous Production */}
              <div
                onClick={() => setProductionMode('continuous')}
                className={`p-3 rounded-2xl border transition-all cursor-pointer select-none flex flex-col justify-between ${
                  productionMode === 'continuous'
                    ? 'bg-[rgba(83,211,226,0.14)] border-[#53D3E2] shadow-[0_0_15px_rgba(83,211,226,0.18)]'
                    : 'bg-[rgba(30,41,59,0.45)] border-[rgba(255,255,255,0.10)] hover:bg-[rgba(255,255,255,0.06)]'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <div className={`w-6 h-6 rounded-lg flex items-center justify-center ${
                      productionMode === 'continuous' ? 'bg-[#53D3E2] text-[#14202E]' : 'bg-[rgba(255,255,255,0.08)] text-[#94a3b8]'
                    }`}>
                      <InfinityIcon className="w-3.5 h-3.5" />
                    </div>
                    <span className="text-xs font-bold text-white">Continuous Run</span>
                  </div>
                  <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                    productionMode === 'continuous' ? 'border-[#53D3E2] bg-[#53D3E2]' : 'border-[rgba(255,255,255,0.3)]'
                  }`}>
                    {productionMode === 'continuous' && <div className="w-1.5 h-1.5 rounded-full bg-[#14202E]" />}
                  </div>
                </div>
                <p className="text-[10px] text-[#cbd5e1] leading-relaxed">
                  Runs continuously without a fixed target until an authorized stop.
                </p>
              </div>

              {/* Option 2: Set Quantity */}
              <div
                onClick={() => setProductionMode('set_quantity')}
                className={`p-3 rounded-2xl border transition-all cursor-pointer select-none flex flex-col justify-between ${
                  productionMode === 'set_quantity'
                    ? 'bg-[rgba(83,211,226,0.14)] border-[#53D3E2] shadow-[0_0_15px_rgba(83,211,226,0.18)]'
                    : 'bg-[rgba(30,41,59,0.45)] border-[rgba(255,255,255,0.10)] hover:bg-[rgba(255,255,255,0.06)]'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <div className={`w-6 h-6 rounded-lg flex items-center justify-center ${
                      productionMode === 'set_quantity' ? 'bg-[#53D3E2] text-[#14202E]' : 'bg-[rgba(255,255,255,0.08)] text-[#94a3b8]'
                    }`}>
                      <Target className="w-3.5 h-3.5" />
                    </div>
                    <span className="text-xs font-bold text-white">Set Quantity</span>
                  </div>
                  <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                    productionMode === 'set_quantity' ? 'border-[#53D3E2] bg-[#53D3E2]' : 'border-[rgba(255,255,255,0.3)]'
                  }`}>
                    {productionMode === 'set_quantity' && <div className="w-1.5 h-1.5 rounded-full bg-[#14202E]" />}
                  </div>
                </div>
                <p className="text-[10px] text-[#cbd5e1] leading-relaxed">
                  Specifies a target volume; automatically marks complete at target.
                </p>
              </div>

            </div>
          </div>

          {/* Conditional Target Quantity Input (Must be multiple of 3) */}
          {productionMode === 'set_quantity' && (
            <div className="p-3.5 rounded-2xl bg-[rgba(83,211,226,0.06)] border border-[rgba(83,211,226,0.25)] animate-fade-in space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                  <Target className="w-3.5 h-3.5 text-[#53D3E2]" /> Target Quantity (Bottles)
                </label>
                {isEditing && editBatch && (
                  <span className="text-[10px] text-[#cbd5e1]">
                    Produced: <strong className="text-[#6BDE8B]">{editBatch.produced_quantity || 0}</strong> bottles
                  </span>
                )}
              </div>
              <div className="relative flex items-center">
                <input
                  type="number"
                  min="3"
                  step="3"
                  value={targetQuantity}
                  onChange={(e) => setTargetQuantity(e.target.value)}
                  placeholder="e.g. 999 (333 boxes)"
                  className="w-full px-3.5 py-2 text-xs rounded-xl bg-[rgba(55,78,102,0.45)] border border-[rgba(215,232,248,0.22)] text-white outline-none focus:border-[#53D3E2] focus:ring-1 focus:ring-[#53D3E2]/40 transition-colors"
                  required
                />
                <span className="absolute right-3 text-[11px] text-[#94a3b8] pointer-events-none font-medium flex items-center gap-1">
                  <Package className="w-3 h-3 text-[#53D3E2]" /> bottles
                </span>
              </div>

              {/* Box packaging helper and multiple-of-3 status */}
              <div className="flex items-center justify-between text-[11px] flex-wrap gap-1 pt-0.5">
                <div>
                  {isMultipleOf3 ? (
                    <span className="text-[#6BDE8B] font-semibold flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      {parsedTarget} bottles = {boxesCount} full boxes (3 bottles/box)
                    </span>
                  ) : isValidTargetNum ? (
                    <span className="text-[#ef4444] font-semibold flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5" />
                      Must be a multiple of 3 (e.g. {Math.ceil(parsedTarget / 3) * 3} bottles)
                    </span>
                  ) : (
                    <span className="text-[#cbd5e1]">
                      Must be a multiple of 3 according to box size (3 bottles per box).
                    </span>
                  )}
                </div>

                {isMultipleOf3 && (
                  <span className="text-[10px] text-[#53D3E2] bg-[rgba(83,211,226,0.12)] border border-[rgba(83,211,226,0.25)] px-2 py-0.5 rounded-md font-bold">
                    {boxesCount} BOXES
                  </span>
                )}
              </div>
            </div>
          )}

          {/* C. Scheduled Start Date and Time — COMPLETELY INVISIBLE IF NOT SUPPORTED */}
          {isScheduleSupported && (
            <div className="pt-2 animate-fade-in">
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-[#53D3E2]" /> Scheduled Start
                </label>
                {(scheduledDate || scheduledTime) && (
                  <button
                    type="button"
                    onClick={() => {
                      setScheduledDate('');
                      setScheduledTime('');
                    }}
                    className="text-[10px] text-[#53D3E2] hover:underline cursor-pointer"
                  >
                    Start Immediately
                  </button>
                )}
              </div>

              <div className="space-y-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[10px] text-[#cbd5e1] font-medium mb-1">Start Date</label>
                    <div className="relative">
                      <input
                        type="date"
                        value={scheduledDate}
                        onChange={(e) => setScheduledDate(e.target.value)}
                        className="w-full px-3 py-2 text-xs rounded-xl bg-[rgba(55,78,102,0.45)] border border-[rgba(215,232,248,0.22)] text-white outline-none focus:border-[#53D3E2] transition-colors cursor-pointer"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] text-[#cbd5e1] font-medium mb-1">Start Time</label>
                    <div className="relative">
                      <input
                        type="time"
                        value={scheduledTime}
                        onChange={(e) => setScheduledTime(e.target.value)}
                        className="w-full px-3 py-2 text-xs rounded-xl bg-[rgba(55,78,102,0.45)] border border-[rgba(215,232,248,0.22)] text-white outline-none focus:border-[#53D3E2] transition-colors cursor-pointer"
                      />
                    </div>
                  </div>
                </div>
                <p className="text-[10px] text-[#94a3b8]">
                  {scheduledDate
                    ? 'Batch will be queued and start automatically at the scheduled time once the production line is available.'
                    : 'No schedule specified: will start immediately if no other batch is currently running.'}
                </p>
              </div>
            </div>
          )}

          {/* Modal Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-[rgba(255,255,255,0.10)]">
            <GlassButton size="sm" variant="outline" type="button" onClick={onClose} disabled={loading}>
              Cancel
            </GlassButton>
            <GlassButton
              size="sm"
              variant="pill"
              type="submit"
              disabled={loading}
              className="bg-[#53D3E2] text-[#14202E] font-bold hover:bg-[#6BDE8B]"
              icon={<CheckCircle2 className="w-3.5 h-3.5" />}
            >
              {loading
                ? isEditing ? 'Updating...' : 'Creating...'
                : isEditing ? 'Save Changes' : 'Create Batch'}
            </GlassButton>
          </div>

        </form>
      </div>
    </div>
  );
};
