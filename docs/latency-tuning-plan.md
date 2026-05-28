# Live Translation Latency Tuning Plan

This document explains how to make the live translator feel closer to mature tools such as Transync AI.

The main goal is not only to reduce raw model time. The bigger goal is to improve perceived real-time behavior:

1. Show useful partial text while the speaker is still talking.
2. Detect sentence endings more naturally.
3. Replace rough partial text with a cleaner final sentence.
4. Keep the GPU queue current instead of translating old audio late.
5. Measure each stage so tuning decisions are based on data.

## Current Pipeline

Current browser and backend flow:

```text
Browser microphone
-> 16 kHz PCM audio chunks
-> WebSocket /ws
-> TranslationSession input queue
-> VadSegmenter using WebRTC VAD
-> final utterance buffer
-> faster-whisper transcribe / translate
-> text translation if target is not English
-> WebSocket translation event
-> browser transcript boxes
```

Current important files:

| Area | File | Current role |
| --- | --- | --- |
| Frontend audio capture | `docs/app.js` | Captures microphone audio with `ScriptProcessorNode`, downsamples to 16 kHz PCM, sends binary WebSocket frames. |
| Frontend UI events | `docs/app.js` | Handles `hello`, `ready`, `status`, `language`, `translation`, and `error` events. |
| Local backend UI copy | `live_translate/static/app.js` | Older/local static app with the same basic audio and translation flow. |
| WebSocket endpoint | `live_translate/app.py` | Authenticates, creates a session, receives audio, forwards session events. |
| VAD and queues | `live_translate/session.py` | Converts incoming PCM into VAD speech segments and queues translation jobs. |
| Whisper inference | `live_translate/translator.py` | Runs faster-whisper, filters low-confidence/noise/hallucination output, returns source and target text. |
| Runtime settings | `live_translate/config.py` | Holds VAD, model, queue, GPU, and filtering environment variables. |
| Startup scripts | `start-protected-https.ps1`, `start-translator-stack.ps1` | Start the backend with current model/session/GPU defaults. |

## Current Code Check

The plan is feasible with the current architecture.

| Improvement | Current support | What must change |
| --- | --- | --- |
| Faster final response by tuning VAD | Already supported by `END_SILENCE_MS`, `MIN_SPEECH_MS`, `MAX_SEGMENT_MS`, `VAD_AGGRESSIVENESS`, and `WHISPER_BEAM_SIZE`. | No code needed for first test. Start with environment/script tuning. |
| Queue protection | Already supported by `MAX_TRANSLATION_QUEUE_SEGMENTS` and stale queue dropping. | Add clearer timing metrics to know when queue pressure happens. |
| Final sentence replacement | Partly supported. The frontend appends lines, but does not update previous lines. | Add stable `segment_id` and event mode so final text can replace a partial line. |
| Partial live captions | Not currently supported. The backend waits for VAD flush before inference. | Add a partial inference path while a segment is active. |
| Better sentence boundary behavior | Basic VAD only. It flushes on silence or max segment length. | Add adaptive rules around silence, punctuation, max active duration, and optional partial confidence. |
| Better browser audio capture | Current code uses `ScriptProcessorNode`, which works but is older. | Later replace with `AudioWorklet` for smoother low-latency streaming. |
| Better noise handling | Current code has WebRTC VAD, RMS filter, no-speech threshold, log-prob threshold, compression threshold, and hallucination phrase filter. | Add adaptive noise floor and optional Silero VAD as a second-stage upgrade. |
| Latency stage metrics | Current UI shows total `latency_seconds` and `audio_seconds`. | Add timestamps for receive, VAD commit, inference start/end, translation end, and client receive. |

## Phase 0: Immediate Tuning Without Code Changes

Purpose: test whether the existing app can feel faster using only runtime settings.

Recommended fast preset:

```powershell
$env:END_SILENCE_MS="450"
$env:MIN_SPEECH_MS="400"
$env:MAX_SEGMENT_MS="4500"
$env:VAD_AGGRESSIVENESS="2"
$env:WHISPER_BEAM_SIZE="1"
$env:MAX_TRANSLATION_QUEUE_SEGMENTS="1"
```

Recommended balanced preset:

```powershell
$env:END_SILENCE_MS="600"
$env:MIN_SPEECH_MS="450"
$env:MAX_SEGMENT_MS="6000"
$env:VAD_AGGRESSIVENESS="2"
$env:WHISPER_BEAM_SIZE="1"
$env:MAX_TRANSLATION_QUEUE_SEGMENTS="2"
```

Recommended quality preset:

```powershell
$env:END_SILENCE_MS="750"
$env:MIN_SPEECH_MS="520"
$env:MAX_SEGMENT_MS="7000"
$env:VAD_AGGRESSIVENESS="2"
$env:WHISPER_BEAM_SIZE="3"
$env:MAX_TRANSLATION_QUEUE_SEGMENTS="2"
```

Expected result:

- Fast preset should feel more responsive.
- Balanced preset should be the normal default if quality remains acceptable.
- Quality preset should be used when accuracy is more important than speed.

Risk:

- Lower `END_SILENCE_MS` may split Korean sentences too early.
- Lower `MAX_TRANSLATION_QUEUE_SEGMENTS` keeps the app live, but can drop speech if the GPU falls behind.

## Phase 1: Add Latency Metrics

Purpose: make latency visible by stage.

Add backend timing fields to translation events:

```json
{
  "type": "translation",
  "segment_id": "session-local-counter",
  "mode": "final",
  "audio_seconds": 2.35,
  "latency_seconds": 0.91,
  "timing": {
    "server_received_at": 123.10,
    "vad_committed_at": 124.40,
    "inference_started_at": 124.41,
    "inference_finished_at": 125.01,
    "event_sent_at": 125.02
  }
}
```

Files to change:

- `live_translate/session.py`: record audio receive time, VAD commit time, queue wait time, inference start/end time.
- `live_translate/translator.py`: return model inference timing details or accept a caller timer.
- `docs/app.js`: display detailed latency in the status or admin panel.
- `live_translate/static/app.js`: keep local backend UI compatible if still used.

Acceptance test:

- UI still shows normal `Latency`.
- Admin or debug output can show queue wait, VAD wait, and model time.
- No audio behavior changes yet.

## Phase 2: Add Segment IDs And Updateable Lines

Purpose: allow the UI to update a line instead of only appending new text.

Current problem:

- `appendTranscript()` always pushes a new source and target line.
- A partial/final pipeline would create duplicates unless the UI can replace an existing line.

New event contract:

```json
{
  "type": "translation",
  "segment_id": "s-42",
  "mode": "partial",
  "source_text": "오늘 뭐",
  "translated_text": "Today what",
  "is_final": false
}
```

```json
{
  "type": "translation",
  "segment_id": "s-42",
  "mode": "final",
  "source_text": "오늘 뭐 먹을까?",
  "translated_text": "What should we eat today?",
  "is_final": true
}
```

Frontend state change:

```text
sourceLines: [{ id, text, isFinal }]
targetLines: [{ id, text, isFinal }]
```

Render behavior:

- If `segment_id` exists and line already exists, update it.
- If `mode=partial`, show it as the latest active line.
- If `mode=final`, replace the partial line and mark it final.
- If old events do not have `segment_id`, keep appending for backward compatibility.

Files to change:

- `docs/app.js`
- `live_translate/static/app.js`
- `docs/styles.css` for a subtle partial style, for example lower opacity or dotted border.

Acceptance test:

- Existing final-only translation still works.
- A simulated partial event updates one line.
- A final event replaces the same line.
- Copy buttons copy final and partial visible text in order.

## Phase 3: Add Partial Transcription Worker

Purpose: show text while the speaker is still talking.

Current behavior in `VadSegmenter`:

- It stores active speech in `segment_buffer`.
- It only returns audio when silence or max segment length flushes the segment.

New behavior:

- Keep the final VAD flush behavior.
- While active speech continues, emit a partial audio snapshot every `PARTIAL_INTERVAL_MS`.
- Send partial jobs to a separate bounded partial queue.
- Drop old partial jobs aggressively because stale partial captions are not useful.

New settings:

```python
enable_partial_results: bool = _env_bool("ENABLE_PARTIAL_RESULTS", True)
partial_interval_ms: int = int(os.getenv("PARTIAL_INTERVAL_MS", "1000"))
partial_min_audio_ms: int = int(os.getenv("PARTIAL_MIN_AUDIO_MS", "900"))
partial_max_queue_segments: int = int(os.getenv("PARTIAL_MAX_QUEUE_SEGMENTS", "1"))
partial_beam_size: int = int(os.getenv("PARTIAL_WHISPER_BEAM_SIZE", "1"))
final_beam_size: int = int(os.getenv("FINAL_WHISPER_BEAM_SIZE", str(beam_size)))
```

Backend design:

```text
Input thread:
  receive audio frames
  feed VAD
  if active and partial interval reached:
    snapshot active segment buffer
    queue partial job
  if VAD final flush:
    queue final job

Partial worker:
  run fast transcribe/translate with beam_size=1
  send mode=partial event

Final worker:
  run normal final inference
  send mode=final event
```

Important rule:

- Do not let partial jobs block final jobs.
- If GPU is busy, final jobs must win.
- If needed, partial worker can skip when final queue is non-empty.

Files to change:

- `live_translate/config.py`
- `live_translate/session.py`
- `live_translate/translator.py`
- `docs/app.js`
- `live_translate/static/app.js`

Acceptance test:

- Speaking for 4 seconds produces at least one partial event before the final event.
- Final event replaces the partial line.
- If GPU is busy, partial events are dropped first.
- Final translations do not arrive late after newer speech.

## Phase 4: Final Sentence Correction

Purpose: improve translation quality after the sentence ends.

Current behavior:

- Final translation is already the only translation.
- It uses one pass, often `task=translate` for English target.

Improved behavior:

- Partial pass uses fast settings.
- Final pass uses better settings.
- For Korean to English:
  - Option A: Whisper `task=translate` for direct English result.
  - Option B: Whisper `task=transcribe` to Korean, then text translation to English with a stronger text model.

Recommended first implementation:

- Keep direct Whisper `task=translate` for final English because it is already implemented.
- Use `FINAL_WHISPER_BEAM_SIZE=3` only for final pass if latency is acceptable.
- Keep `condition_on_previous_text=False` to avoid hallucination from prior segments.

Possible later implementation:

- Add a Korean text correction step before translation.
- Add context memory from the last 1 to 3 final source lines.
- Use a small local LLM only for punctuation and cleanup, not for changing meaning.

Acceptance test:

- Final English is usually better than partial English.
- Final Korean source line is cleaner than partial Korean source line.
- The UI does not duplicate partial and final text.

## Phase 5: Better Sentence Boundary Rules

Purpose: avoid splitting too early or waiting too long.

Current boundary rule:

```text
flush when silence frames >= END_SILENCE_MS
or segment frames >= MAX_SEGMENT_MS
```

Add smarter rules:

- If segment is short, wait a little longer before final flush.
- If segment is long and has a recent pause, flush earlier.
- If partial transcript already ends with punctuation, allow shorter silence.
- If source language is Korean, treat endings like `요`, `다`, `까`, `죠`, `네` plus pause as stronger final candidates.

Risk:

- Text-based boundary rules require partial transcript text, so they should come after Phase 3.
- Korean endings are helpful but not perfect. They should only adjust timing, not force finalization alone.

Acceptance test:

- Short Korean phrases do not get cut after one word.
- Long sentences are not delayed until the full max segment length.
- Natural pauses create separate lines.

## Phase 6: Browser AudioWorklet

Purpose: replace old `ScriptProcessorNode` with a modern lower-latency audio path.

Current frontend:

```javascript
const processorNode = audioContext.createScriptProcessor(2048, 1, 1);
processorNode.onaudioprocess = ...
```

New frontend:

```text
AudioWorkletProcessor
-> send Float32 blocks to main thread
-> downsample to 16 kHz PCM
-> WebSocket binary send
```

Files to add/change:

- `docs/audio-worklet.js`
- `docs/app.js`
- `live_translate/static/audio-worklet.js`
- `live_translate/static/app.js`

Risk:

- AudioWorklet requires secure context, which we already need for microphone access.
- Some browser compatibility testing is needed on Android Chrome and desktop Edge/Chrome.

Acceptance test:

- Chrome desktop works.
- Edge desktop works.
- Galaxy S25 Chrome works over HTTPS.
- If AudioWorklet fails, fallback to current ScriptProcessor path.

## Phase 7: Better VAD And Noise Handling

Purpose: reduce hallucinated text from silence, fan noise, room noise, or weak audio.

Current filters:

- WebRTC VAD in `live_translate/session.py`.
- RMS filter through `MIN_AUDIO_RMS`.
- faster-whisper `no_speech_threshold`.
- faster-whisper `log_prob_threshold`.
- faster-whisper `compression_ratio_threshold`.
- Hallucination phrase blocklist in `live_translate/translator.py`.

Next improvements:

1. Adaptive RMS noise floor:
   - Track RMS during non-speech frames.
   - Reject speech segments that are too close to the current noise floor.

2. Two-stage VAD:
   - Keep WebRTC VAD for fast frame-level decisions.
   - Optionally add Silero VAD before final inference for stronger speech validation.

3. Segment quality summary:
   - Send skipped segment reason to admin/debug UI.
   - Count rejected low-energy and likely hallucination segments.

Acceptance test:

- Quiet room silence does not create text.
- Fan/background noise does not repeatedly create `Thanks for watching`.
- Soft speech still works after tuning.

## Recommended Implementation Order

1. Commit or set aside unrelated mobile CSS changes before starting backend work.
2. Add latency metrics only.
3. Add `segment_id` and updateable UI lines.
4. Add partial/final event support with partial disabled by default.
5. Enable partial mode and tune intervals.
6. Add final beam-size separation.
7. Add AudioWorklet fallback path.
8. Add adaptive noise floor or Silero VAD.

## Minimal First PR

The smallest useful code change should include:

- `segment_id` and `mode` fields on translation events.
- UI update-by-segment behavior.
- Timing fields in translation events.
- No partial inference yet.

Why this first:

- It is low risk.
- It prepares the UI for partial/final.
- It gives latency data before deeper work.

## Second PR

Add partial inference:

- New settings for partial mode.
- Partial queue with max size 1.
- Partial worker that skips when final queue is busy.
- UI partial styling.

## Third PR

Improve quality:

- Separate partial and final beam sizes.
- Optional final re-translation.
- Smarter sentence boundaries.
- Better noise floor logic.

## Test Checklist

Basic local test:

1. Start the protected backend.
2. Open the GitHub Pages app or local preview.
3. Connect backend.
4. Allow microphone permission when the browser asks.
5. Speak one short Korean sentence.
6. Confirm one final line appears.
7. Speak one long Korean sentence for 4 to 6 seconds.
8. Confirm partial text appears before final text after Phase 3.
9. Stop talking.
10. Confirm final text replaces partial text.

Latency test:

1. Record `audio_seconds`.
2. Record total `latency_seconds`.
3. Record VAD wait.
4. Record queue wait.
5. Record inference time.
6. Compare fast, balanced, and quality presets.

Noise test:

1. Leave mic open in silence for 2 minutes.
2. Turn on fan or room noise.
3. Confirm no repeated fake phrases appear.
4. Speak softly.
5. Confirm speech still translates.

Mobile test:

1. Open the page from Galaxy S25 Chrome over HTTPS.
2. Allow microphone.
3. Speak Korean near the phone.
4. Confirm partial/final events update correctly.
5. Lock and unlock screen only as an exploratory check. Browser audio may stop when the screen locks.

## Success Metrics

Target numbers for RTX 4080 Super:

| Metric | Good target | Notes |
| --- | --- | --- |
| First partial text | 1.0 to 1.8 seconds after speech starts | Depends on partial interval and model load. |
| Final text after speech ends | 0.7 to 1.5 seconds | Depends on sentence length and beam size. |
| Queue wait | Below 0.3 seconds for one user | If higher, reduce sessions or partial work. |
| Dropped final segments | 0 | Dropping partial segments is acceptable. |
| Dropped partial segments | Acceptable under GPU load | Better to stay live than show stale text. |
| Silence hallucinations | 0 repeated fake phrases in 2 minute silence test | Tune RMS/VAD if this fails. |

## Conclusion

The current code can improve in the planned direction.

Immediate tuning is already possible with environment variables. The larger improvement needs code changes, but the current architecture is suitable because audio segmentation, translation work, WebSocket events, and frontend rendering are already separated enough to evolve safely.

The best next code step is not full partial transcription yet. The best next step is to add `segment_id`, updateable transcript lines, and detailed latency metrics. After that, partial/final live captions can be added with much lower risk.
