# Galaxy S25 Native Translator Path

This note explains how the Galaxy S25 can be used with this live translator project.

There are two realistic ways to use the S25:

1. **Phone as the microphone/browser client:** the Galaxy S25 opens the website, records microphone audio, and sends it to the RTX 4080 Super PC. This is the recommended quality path because the PC can run `large-v3`.
2. **Phone-only native app:** the Galaxy S25 runs speech recognition and text translation directly on the phone. This is portable and private, but it should start with mobile-sized models such as Whisper Tiny/Base or Android system APIs, not desktop `large-v3`.

## Recommended First Path: S25 As Client, RTX 4080 Super As Server

Use this when you want the best Korean recognition and smoother English translation.

```text
Galaxy S25 microphone
  -> Chrome/Samsung Internet browser
  -> HTTPS/WSS website
  -> RTX 4080 Super FastAPI server
  -> faster-whisper large-v3 on CUDA
  -> Korean transcript + English translation
```

For home LAN testing, open:

```text
https://192.168.0.20:8443/
```

For outside-the-house access, put Cloudflare Tunnel and Cloudflare Access in front of the server:

```text
Galaxy S25 anywhere
  -> https://translate.your-domain.com
  -> Cloudflare Access login
  -> Cloudflare Tunnel
  -> RTX 4080 Super PC at home
```

Do not expose the translator with simple router port-forwarding unless there is a real authentication layer in front of it.

## Phone-Only Native App Path

The Galaxy S25 has strong mobile AI hardware, but Android does not automatically run arbitrary Python or desktop Whisper models on the NPU. A native app should be built with Android-supported runtimes.

Recommended architecture:

```text
Galaxy S25 microphone
  -> Native Kotlin Android app
  -> ASR engine: Android on-device recognizer, ML Kit GenAI Speech Recognition, or Qualcomm AI Hub WhisperKit Android
  -> Korean text
  -> ML Kit on-device Translation: Korean -> English
  -> Two scrollable text boxes with copy buttons
```

## Build Order

1. **Native UI shell:** Kotlin + Jetpack Compose, two transcript boxes, source/target language selectors, start/pause/clear/copy controls.
2. **Fast prototype ASR:** test Android `SpeechRecognizer.createOnDeviceSpeechRecognizer()` or ML Kit GenAI Speech Recognition on the actual S25. Keep a fallback path because availability depends on the device software stack.
3. **Translation:** use ML Kit Translation for Korean-to-English text translation. Download the Korean and English translation models on first run.
4. **Custom local ASR:** replace the system recognizer with Qualcomm AI Hub WhisperKit Android using Whisper Tiny or Base.
5. **Acceleration tuning:** profile CPU/GPU/NPU behavior. Use LiteRT/TFLite delegates or Qualcomm AI Hub optimized assets where supported.
6. **Offline test:** airplane-mode test after model download. Verify Korean speech still transcribes and translates.

## Model Guidance

| Target | Suggested model | Why |
| --- | --- | --- |
| Galaxy S25 native MVP | Android on-device recognizer or ML Kit GenAI Speech Recognition | Fastest way to test phone-only UX. |
| Galaxy S25 custom ASR | Whisper Tiny or Base through WhisperKit Android | Designed for mobile-sized real-time ASR experiments. |
| Galaxy S25 translation | ML Kit Translation Korean to English | Small on-device text translation model with Korean and English support. |
| RTX 4080 Super server | faster-whisper `large-v3` | Better Korean recognition and translation quality than phone-sized models. |

## Important Limits

- The Galaxy S25 NPU is not a magic switch for desktop models. The model must be converted, quantized, and run through an Android-supported runtime.
- NPU/GPU acceleration depends on supported operations, quantization, runtime delegate, and vendor drivers. Always profile on the real phone.
- Samsung's built-in Live Translate and Interpreter are useful benchmarks, and Korean/English are supported Galaxy AI languages, but they are Samsung features rather than a general API for this custom app.
- For best quality, keep the RTX 4080 Super server path. For privacy and travel, build the phone-only path with a smaller model.

## Useful References

- [Samsung Galaxy S25 AI hardware announcement](https://news.samsung.com/global/samsung-galaxy-s25-series-sets-the-standard-of-ai-phone-as-a-true-ai-companion)
- [Samsung Live Translate support](https://www.samsung.com/us/support/answer/ANS10000935/)
- [Cloudflare Tunnel](https://developers.cloudflare.com/tunnel/)
- [Cloudflare Access self-hosted apps](https://developers.cloudflare.com/cloudflare-one/applications/configure-apps/self-hosted-apps/)
- [Cloudflare WebSockets](https://developers.cloudflare.com/network/websockets/)
- [Qualcomm AI Hub WhisperKit Android](https://aihub.qualcomm.com/apps/whisper_kit_android?os=Android)
- [ML Kit Translation supported languages](https://developers.google.com/ml-kit/language/translation/translation-language-support)
- [ML Kit GenAI APIs](https://developer.android.com/ai/gemini-nano/ml-kit-genai)
- [Android SpeechRecognizer API](https://developer.android.com/reference/android/speech/SpeechRecognizer)
- [Android Neural Networks API notes](https://developer.android.com/ndk/guides/neuralnetworks)
- [LiteRT GPU delegate](https://ai.google.dev/edge/litert/performance/gpu)
