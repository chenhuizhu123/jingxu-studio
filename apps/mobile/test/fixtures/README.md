# Audio fixture

`voice.wav` is a locally generated 0.4-second, 640 Hz sine wave, 16 kHz mono PCM. It is not recorded speech or provider-generated voice. Tests use its actual bytes for the Speech-compatible API and ZIP round trip; native audio decoding and pronunciation quality require separate device/provider validation.

Generated from the repository root:

```sh
node_modules/ffmpeg-static/ffmpeg -hide_banner -loglevel error -y -f lavfi -i sine=frequency=640:sample_rate=16000 -t 0.4 -ac 1 apps/mobile/test/fixtures/voice.wav
```
## First-frame video fixture

`first-frame.mp4` is a synthetic 64 × 112, 0.4-second H.264 clip used as the Seedance response in tests. It was generated with FFmpeg using the `color=c=teal:s=64x112:r=25` filter.

