# Hiragana Conversion Freeze Debug Report

## Issue Description
Applying "Hiragana Conversion" to a large dataset (~200k items) causes the application to freeze or stop processing.
- Initial Symptom: Stops around 60,000 items.
- Later Findings: With `setTimeout(0)`, it reaches ~90,000 items before slowing down/stopping.
- Comparison: A standalone `test.html` with identical logic works correctly.

## Debugging Chronology

### 1. Simple Loop Implementation (Step 33)
- **Change**: Replaced `processWithBatching` with a direct `for...of` loop.
- **Result**: **Failed** (Stops at ~60k).

### 2. Batched Update (Step 39)
- **Change**: Buffer results and call `onChunk` only every 2000 items.
- **Hypothesis**: Frequent UI/Bag updates caused overhead.
- **Result**: **Failed**.

### 3. Batch-All (Step 57)
- **Change**: Buffer ALL results and update only once at the end.
- **Hypothesis**: Any intermediate updates caused the freeze.
- **Result**: **Failed**.

### 4. Remove `normNFKC` (Step 106)
- **Change**: Removed `String.prototype.normalize('NFKC')` to match `test.html` exactly.
- **Hypothesis**: Specific characters causing issues during normalization.
- **Result**: **Failed** (Freeze persisted).

### 5. Add Logging (Step 126)
- **Change**: Added console logs every 2000 items.
- **Finding**: Processing actually continues up to ~80k-90k items.
- **Logs**: Showed processing of items like "日吉津", "源小国", "利久", "コガネイ", "カルピス" around the 90k mark.

### 6. Align Yielder (Step 137)
- **Change**: Replaced `waitFrame` (30ms) with `setTimeout(..., 0)` to strictly match `test.html`.
- **Result**: Reached ~91k items. Slight improvement but still freezes/slows.

### 7. Local Set Accumulation (Step 147)
- **Change**: Use `new Set()` locally for accumulation (matching `test.html` memory pattern) instead of `onChunk` arrays.
- **Result**: **Failed** (Freeze persisted).

### 8. Timeout Wrapper (Step 161)
- **Change**: Wrapped `fastConverter` in a 200ms `Promise.race` timeout.
- **Goal**: Identify if specific items cause the conversion engine to hang.
- **Result**: **Failed**. No logs were produced, implying the main thread froze completely, preventing timeouts from firing.

### 9. Library CDN Substitution (Step 203)
- **Change**: Modified `kuro-wrapper.js` to load Kuroshiro/Kuromoji from CDN (jsdelivr) instead of local files, matching `test.html` environment exactly.
- **Result**: **Failed**. Behavior identical (freeze at ~90k). This rules out local library corruption or version mismatch.

### 10. Standalone Loop (Step 216)
- **Change**: Rewrote `op_normalize_hiragana` to bypass `runProgressiveOp` entirely, managing `Bag` creation manually to remove any closure/wrapper overhead.
- **Result**: **Failed**.

## Conclusion
We have ruled out:
- UI Rendering overhead (Batch-All failed).
- Bag/Memory overhead (Local Set failed).
- Library Version/Corruption (CDN substitution failed).
- `runProgressiveOp` overhead (Standalone loop failed).
- `normNFKC` issues (Removal failed).

The issue appears to be a fundamental limitation of running this specific heavy text processing (Kuroshiro/Kuromoji) on the main thread within the application's memory context involving ~200k items. `test.html` likely succeeds due to a simpler global context or slightly different GC behavior in a fresh page.

## Recommendation
Consider moving the conversion logic to a **Web Worker** to unblock the main thread and allow the browser to manage resources more effectively.
