// Studio cost estimates: real catalogue models priced against real rows of Kie's list, checked against what
// Kie actually charged for the same inputs (history, 2026-10-11), plus the learned-charge preference.
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ModelDefinition } from './api.ts'
import { estimateCredits, learnedKey, rowsForModel, type LearnedPrice, type PriceRow } from './pricing.ts'

/* Real catalogue definitions (GET /api/models, 2026-10-11); long descriptions and voice lists trimmed. */
const MODELS: Record<string, ModelDefinition> = {
  "gpt-image-2-text-to-image": {
    id: "gpt-image-2-text-to-image", model: "gpt-image-2-text-to-image", title: "GPT Image-2 - Text to Image", category: "image", provider: "market",
    fields: [
      {"name":"prompt","type":"textarea","label":"Prompt","required":true,"maxLength":20000},
      {"name":"aspect_ratio","type":"enum","label":"Aspect Ratio","required":false,"enum":["auto","1:1","3:2"]},
      {"name":"resolution","type":"enum","label":"Resolution","required":false,"enum":["1K","2K","4K"]},
      {"name":"background","type":"enum","label":"Background","required":false,"enum":["transparent","opaque","auto"]},
    ],
  },
  "nano-banana-pro": {
    id: "nano-banana-pro", model: "nano-banana-pro", title: "Google - Nano Banana Pro", category: "image", provider: "market",
    fields: [
      {"name":"prompt","type":"textarea","label":"Prompt","required":true,"maxLength":20000},
      {"name":"image_input","type":"reference","label":"Image Input","required":false,"maxItems":8,"accept":"image/jpeg,image/png,image/webp,image/*","mentionStyle":"at-image","maxFileSizeMb":30},
      {"name":"aspect_ratio","type":"enum","label":"Aspect Ratio","required":false,"default":"1:1","enum":["1:1","2:3","3:2","3:4","4:3","4:5","5:4","9:16","16:9","21:9","auto"]},
      {"name":"resolution","type":"enum","label":"Resolution","required":false,"default":"1K","enum":["1K","2K","4K"]},
      {"name":"output_format","type":"enum","label":"Output Format","required":false,"enum":["png","jpg"]},
    ],
  },
  "bytedance/seedance-2": {
    id: "bytedance/seedance-2", model: "bytedance/seedance-2", title: "bytedance-seedance-2", category: "video", provider: "market",
    fields: [
      {"name":"prompt","type":"textarea","label":"Prompt","required":true,"maxLength":20000},
      {"name":"first_frame_url","type":"reference","label":"First Frame Url","required":false,"accept":"image/jpeg,image/png,image/webp,image/*","mentionStyle":"at-image","maxItems":1,"scalar":true},
      {"name":"last_frame_url","type":"reference","label":"Last Frame Url","required":false,"accept":"image/jpeg,image/png,image/webp,image/*","mentionStyle":"at-image","maxItems":1,"scalar":true},
      {"name":"reference_image_urls","type":"reference","label":"Reference Image Urls","required":false,"maxItems":9,"accept":"image/jpeg,image/png,image/webp,image/*","mentionStyle":"at-image"},
      {"name":"reference_video_urls","type":"reference","label":"Reference Video Urls","required":false,"maxItems":3,"accept":"video/*,image/*","mentionStyle":"at-video"},
      {"name":"reference_audio_urls","type":"reference","label":"Reference Audio Urls","required":false,"maxItems":3,"accept":"audio/*","mentionStyle":"at-audio"},
      {"name":"return_last_frame","type":"boolean","label":"Return Last Frame","required":false,"default":false},
      {"name":"generate_audio","type":"boolean","label":"Generate Audio","required":false,"default":true},
      {"name":"resolution","type":"enum","label":"Resolution","required":false,"default":"720p","enum":["480p","720p","1080p","4k"]},
      {"name":"aspect_ratio","type":"enum","label":"Aspect Ratio","required":true,"default":"16:9","enum":["1:1","4:3","3:4","16:9","9:16","21:9","adaptive"]},
      {"name":"duration","type":"number","label":"Duration","required":false,"default":5,"step":1,"min":4,"max":15},
      {"name":"web_search","type":"boolean","label":"Web Search","required":false},
      {"name":"nsfw_checker","type":"boolean","label":"Nsfw Checker","required":false},
    ],
  },
  "kling-3.0-omni/text-to-video": {
    id: "kling-3.0-omni/text-to-video", model: "kling-3.0-omni/text-to-video", title: "Kling 3.0 Omni Text to Video", category: "video", provider: "market",
    fields: [
      {"name":"prompt","type":"textarea","label":"Prompt","required":true,"maxLength":3072},
      {"name":"customize_multi_shots","type":"boolean","label":"Customize Multi Shots","required":false,"default":false},
      {"name":"prefer_multi_shots","type":"boolean","label":"Prefer Multi Shots","required":false},
      {"name":"multi_prompt","type":"json","label":"Multi Prompt","required":false,"default":[],"maxItems":6},
      {"name":"elements","type":"json","label":"Elements","required":false,"default":[]},
      {"name":"audio","type":"boolean","label":"Audio","required":false,"default":false},
      {"name":"resolution","type":"enum","label":"Resolution","required":false,"default":"720p","enum":["720p","1080p","4k"]},
      {"name":"aspect_ratio","type":"enum","label":"Aspect Ratio","required":false,"default":"16:9","enum":["16:9","9:16","1:1"]},
      {"name":"duration","type":"number","label":"Duration","required":false,"default":5,"enum":[],"min":3,"max":15,"step":1},
    ],
  },
  "google/gemini-omni-flash-1-1": {
    id: "google/gemini-omni-flash-1-1", model: "google/gemini-omni-flash-1-1", title: "Gemini Omni 1.1 Flash", category: "video", provider: "market",
    fields: [
      {"name":"prompt","type":"textarea","label":"Prompt","required":true,"maxLength":20000},
      {"name":"image_urls","type":"reference","label":"Image Urls","required":false,"accept":"image/jpeg,image/png,image/webp,image/*","mentionStyle":"at-image","maxItems":8},
      {"name":"first_frame_url","type":"reference","label":"First Frame Url","required":false,"accept":"image/jpeg,image/png,image/webp,image/*","mentionStyle":"at-image","maxItems":1,"scalar":true},
      {"name":"last_frame_url","type":"reference","label":"Last Frame Url","required":false,"accept":"image/jpeg,image/png,image/webp,image/*","mentionStyle":"at-image","maxItems":1,"scalar":true},
      {"name":"audio_ids","type":"reference","label":"Audio Ids","required":false,"accept":"audio/*","mentionStyle":"at-audio","maxItems":8},
      {"name":"video_list","type":"json","label":"Video List","required":false},
      {"name":"character_ids","type":"reference","label":"Character Ids","required":false,"accept":"image/jpeg,image/png,image/webp,image/*","mentionStyle":"none","maxItems":8},
      {"name":"duration","type":"enum","label":"Duration","required":true,"enum":["4","6","8","10"]},
      {"name":"aspect_ratio","type":"enum","label":"Aspect Ratio","required":false,"enum":["16:9","9:16"]},
      {"name":"resolution","type":"enum","label":"Resolution","required":false,"default":"720p","enum":["360p","720p","1080p","4k"]},
      {"name":"seed","type":"number","label":"Seed","required":false,"step":1},
    ],
  },
  "market/elevenlabs-tts": {
    id: "market/elevenlabs-tts", model: "elevenlabs/text-to-speech-multilingual-v2", title: "ElevenLabs — Narration", category: "audio", provider: "market", operation: "generate",
    fields: [
      {"name":"text","type":"textarea","label":"Script","required":true,"maxLength":20000},
      {"name":"voice","type":"enum","label":"Voice","required":true,"default":"EkK5I93UQWFDigLMpZcX","enum":["EkK5I93UQWFDigLMpZcX","Z3R5wn05IrDiVCyEkUrK","NNl6r8mD7vthiJatiJt1"]},
      {"name":"stability","type":"number","label":"Stability","required":false,"default":0.5,"min":0,"max":1,"step":0.1},
      {"name":"similarity_boost","type":"number","label":"Similarity Boost","required":false,"default":0.75,"min":0,"max":1,"step":0.1},
      {"name":"style","type":"number","label":"Style","required":false,"default":0,"min":0,"max":1,"step":0.1},
      {"name":"speed","type":"number","label":"Speed","required":false,"default":1,"min":0.7,"max":1.2,"step":0.1},
      {"name":"timestamps","type":"boolean","label":"Timestamps","required":false},
      {"name":"previous_text","type":"textarea","label":"Previous Text","required":false,"maxLength":5000},
      {"name":"next_text","type":"textarea","label":"Next Text","required":false,"maxLength":5000},
      {"name":"language_code","type":"string","label":"Language Code","required":false,"maxLength":500},
    ],
  },
  "veo/generate": {
    id: "veo/generate", model: "veo", title: "Veo — Create a video", category: "video", provider: "veo", operation: "generate",
    fields: [
      {"name":"prompt","type":"textarea","label":"Video instructions","required":true},
      {"name":"imageUrls","type":"reference","label":"Reference image","accept":"image/*","maxItems":3,"mentionStyle":"none"},
      {"name":"model","type":"enum","label":"Veo model","enum":["veo3_fast","veo3"],"default":"veo3_fast"},
      {"name":"aspectRatio","type":"enum","label":"Aspect ratio","enum":["16:9","9:16"],"default":"16:9"},
    ],
  },
  "topaz/image-upscale": {
    id: "topaz/image-upscale", model: "topaz/image-upscale", title: "Topaz - Image Upscale", category: "image", provider: "market",
    fields: [
      {"name":"image_url","type":"reference","label":"Image Url","required":true,"accept":"image/jpeg,image/png,image/webp,image/*","mentionStyle":"at-image","maxFileSizeMb":10,"maxItems":1,"scalar":true},
      {"name":"upscale_factor","type":"enum","label":"Upscale Factor","required":true,"default":"2","enum":["1","2","4"]},
    ],
  },
  "flux-2/pro-text-to-image": {
    id: "flux-2/pro-text-to-image", model: "flux-2/pro-text-to-image", title: "Flux-2 - Pro Text to Image", category: "image", provider: "market",
    fields: [
      {"name":"prompt","type":"textarea","label":"Prompt","required":true,"maxLength":5000},
      {"name":"aspect_ratio","type":"enum","label":"Aspect Ratio","required":true,"enum":["1:1","4:3","3:4","16:9","9:16","3:2","2:3"]},
      {"name":"resolution","type":"enum","label":"Resolution","required":true,"enum":["1K","2K"]},
      {"name":"nsfw_checker","type":"boolean","label":"Nsfw Checker","required":false},
    ],
  },
  "nano-banana-2": {
    id: "nano-banana-2", model: "nano-banana-2", title: "Google - Nano Banana 2", category: "image", provider: "market",
    fields: [
      {"name":"prompt","type":"textarea","label":"Prompt","required":true,"maxLength":20000},
      {"name":"image_input","type":"reference","label":"Image Input","required":false,"maxItems":14,"accept":"image/jpeg,image/png,image/webp,image/*","mentionStyle":"at-image","maxFileSizeMb":30},
      {"name":"aspect_ratio","type":"enum","label":"Aspect Ratio","required":false,"default":"auto","enum":["1:1","2:3","3:2"]},
      {"name":"resolution","type":"enum","label":"Resolution","required":false,"default":"1K","enum":["1K","2K","4K"]},
      {"name":"output_format","type":"enum","label":"Output Format","required":false,"default":"jpg","enum":["png","jpg"]},
    ],
  },
  "kling/v2-5-turbo-text-to-video-pro": {
    id: "kling/v2-5-turbo-text-to-video-pro", model: "kling/v2-5-turbo-text-to-video-pro", title: "Kling - V2.5 Turbo Text to Video Pro", category: "video", provider: "market",
    fields: [
      {"name":"prompt","type":"textarea","label":"Prompt","required":true,"maxLength":2500},
      {"name":"duration","type":"enum","label":"Duration","required":true,"enum":["5","10"]},
      {"name":"aspect_ratio","type":"enum","label":"Aspect Ratio","required":false,"default":"16:9","enum":["16:9","9:16","1:1"]},
      {"name":"negative_prompt","type":"textarea","label":"Negative Prompt","required":false,"maxLength":2500},
      {"name":"cfg_scale","type":"number","label":"Cfg Scale","required":false,"default":0.5,"min":0,"max":1,"step":0.1},
    ],
  },
  "bytedance/seedance-2-mini": {
    id: "bytedance/seedance-2-mini", model: "bytedance/seedance-2-mini", title: "Bytedance Seedance 2.0 Mini", category: "video", provider: "market",
    fields: [
      {"name":"prompt","type":"textarea","label":"Prompt","required":true,"maxLength":20000},
      {"name":"first_frame_url","type":"reference","label":"First Frame Url","required":false,"accept":"image/jpeg,image/png,image/webp,image/*","mentionStyle":"at-image","maxItems":1,"scalar":true},
      {"name":"last_frame_url","type":"reference","label":"Last Frame Url","required":false,"accept":"image/jpeg,image/png,image/webp,image/*","mentionStyle":"at-image","maxItems":1,"scalar":true},
      {"name":"reference_image_urls","type":"reference","label":"Reference Image Urls","required":false,"maxItems":9,"accept":"image/jpeg,image/png,image/webp,image/*","mentionStyle":"at-image"},
      {"name":"reference_video_urls","type":"reference","label":"Reference Video Urls","required":false,"maxItems":3,"accept":"video/*,image/*","mentionStyle":"at-video"},
      {"name":"reference_audio_urls","type":"reference","label":"Reference Audio Urls","required":false,"maxItems":3,"accept":"audio/*","mentionStyle":"at-audio"},
      {"name":"generate_audio","type":"boolean","label":"Generate Audio","required":false,"default":true},
      {"name":"resolution","type":"enum","label":"Resolution","required":false,"default":"720p","enum":["480p","720p"]},
      {"name":"aspect_ratio","type":"enum","label":"Aspect Ratio","required":true,"default":"16:9","enum":["1:1","4:3","3:4","16:9","9:16","21:9","adaptive"]},
      {"name":"duration","type":"number","label":"Duration","required":false,"default":5,"step":1,"min":4,"max":15},
      {"name":"web_search","type":"boolean","label":"Web Search","required":false},
      {"name":"nsfw_checker","type":"boolean","label":"Nsfw Checker","required":false},
    ],
  },
  "kling-2.6/image-to-video": {
    id: "kling-2.6/image-to-video", model: "kling-2.6/image-to-video", title: "Kling 2.6 Image to Video", category: "video", provider: "market",
    fields: [
      {"name":"prompt","type":"textarea","label":"Prompt","required":true,"maxLength":2500},
      {"name":"image_urls","type":"reference","label":"Image Urls","required":true,"maxItems":1,"accept":"image/jpeg,image/png,image/webp,image/*","mentionStyle":"at-image"},
      {"name":"sound","type":"boolean","label":"Sound","required":true},
      {"name":"duration","type":"enum","label":"Duration","required":true,"enum":["5","10"]},
    ],
  },
  "runway/aleph": {
    id: "runway/aleph", model: "runway/aleph", title: "Runway Aleph — Transform a video", category: "video", provider: "runway", operation: "aleph",
    fields: [
      {"name":"_parentTaskId","type":"string","label":"Parent task ID"},
      {"name":"videoUrl","type":"reference","label":"Source video","required":true,"accept":"video/*","scalar":true,"maxItems":1,"mentionStyle":"none"},
      {"name":"prompt","type":"textarea","label":"What to change","required":true},
    ],
  },
}

/* Real rows from Kie's price list (2026-10-11), as server/studio/pricing.ts parses them. */
const ROWS: PriceRow[] = [
  {"modelId":"kling-3.0-omni/image-to-video","page":"kling-o3","description":"kling 3.0 omni, image-to-video, 4k with native audio","credits":67,"unit":"second","unitText":"per second"},
  {"modelId":"kling-3.0-omni/text-to-video","page":"kling-o3","description":"kling 3.0 omni, image-to-video, 4k no native audio","credits":67,"unit":"second","unitText":"per second"},
  {"modelId":"kling-3.0-omni/image-to-video","page":"kling-o3","description":"kling 3.0 omni, image-to-video, 1080p with native audio","credits":23,"unit":"second","unitText":"per second"},
  {"modelId":"kling-3.0-omni/image-to-video","page":"kling-o3","description":"kling 3.0 omni, image-to-video, 1080p no native audio","credits":18,"unit":"second","unitText":"per second"},
  {"modelId":"kling-3.0-omni/image-to-video","page":"kling-o3","description":"kling 3.0 omni, image-to-video, 720p with native audio","credits":18,"unit":"second","unitText":"per second"},
  {"modelId":"kling-3.0-omni/image-to-video","page":"kling-o3","description":"kling 3.0 omni, image-to-video, 720p no native audio","credits":14,"unit":"second","unitText":"per second"},
  {"modelId":"kling-3.0-omni/text-to-video","page":"kling-o3","description":"kling 3.0 omni, text-to-video, 4k with native audio","credits":67,"unit":"second","unitText":"per second"},
  {"modelId":"kling-3.0-omni/text-to-video","page":"kling-o3","description":"kling 3.0 omni, text-to-video, 4k no native audio","credits":67,"unit":"second","unitText":"per second"},
  {"modelId":"kling-3.0-omni/text-to-video","page":"kling-o3","description":"kling 3.0 omni, text-to-video, 1080p with native audio","credits":23,"unit":"second","unitText":"per second"},
  {"modelId":"kling-3.0-omni/text-to-video","page":"kling-o3","description":"kling 3.0 omni, text-to-video, 1080p no native audio","credits":18,"unit":"second","unitText":"per second"},
  {"modelId":"kling-3.0-omni/text-to-video","page":"kling-o3","description":"kling 3.0 omni, text-to-video, 720p with native audio","credits":18,"unit":"second","unitText":"per second"},
  {"modelId":"kling-3.0-omni/text-to-video","page":"kling-o3","description":"kling 3.0 omni, text-to-video, 720p no native audio","credits":14,"unit":"second","unitText":"per second"},
  {"modelId":null,"page":"nano-banana-2-1","description":"nano-banana-2-1, 4K","credits":9,"unit":"image","unitText":"per image"},
  {"modelId":null,"page":"nano-banana-2-1","description":"nano-banana-2-1, 2K","credits":6,"unit":"image","unitText":"per image"},
  {"modelId":null,"page":"nano-banana-2-1","description":"nano-banana-2-1, 1K","credits":4,"unit":"image","unitText":"per image"},
  {"modelId":"gpt-image-2-5-sunburst-image-to-image","page":"gpt-image-2-5","description":"gpt-image-2-5-sunburst, image-to-image, 4K","credits":16,"unit":"image","unitText":"per image"},
  {"modelId":"gpt-image-2-5-sunburst-image-to-image","page":"gpt-image-2-5","description":"gpt-image-2-5-sunburst, image-to-image, 2K","credits":10,"unit":"image","unitText":"per image"},
  {"modelId":"gpt-image-2-5-sunburst-image-to-image","page":"gpt-image-2-5","description":"gpt-image-2-5-sunburst, image-to-image, 1K","credits":6,"unit":"image","unitText":"per image"},
  {"modelId":"gpt-image-2-5-sunburst-text-to-image","page":"gpt-image-2-5","description":"gpt-image-2-5-sunburst, text-to-image, 4K","credits":16,"unit":"image","unitText":"per image"},
  {"modelId":"gpt-image-2-5-sunburst-text-to-image","page":"gpt-image-2-5","description":"gpt-image-2-5-sunburst, text-to-image, 2K","credits":10,"unit":"image","unitText":"per image"},
  {"modelId":"gpt-image-2-5-sunburst-text-to-image","page":"gpt-image-2-5","description":"gpt-image-2-5-sunburst, text-to-image, 1K","credits":6,"unit":"image","unitText":"per image"},
  {"modelId":null,"page":"gpt-image-2-5","description":"gpt-image-2-5-flare, image-to-image, 4K","credits":16,"unit":"image","unitText":"per image"},
  {"modelId":null,"page":"gpt-image-2-5","description":"gpt-image-2-5-flare, image-to-image, 2K","credits":10,"unit":"image","unitText":"per image"},
  {"modelId":null,"page":"gpt-image-2-5","description":"gpt-image-2-5-flare, image-to-image, 1K","credits":6,"unit":"image","unitText":"per image"},
  {"modelId":null,"page":"gpt-image-2-5","description":"gpt-image-2-5-flare, text-to-image, 4K","credits":16,"unit":"image","unitText":"per image"},
  {"modelId":null,"page":"gpt-image-2-5","description":"gpt-image-2-5-flare, text-to-image, 2K","credits":10,"unit":"image","unitText":"per image"},
  {"modelId":null,"page":"gpt-image-2-5","description":"gpt-image-2-5-flare, text-to-image, 1K","credits":6,"unit":"image","unitText":"per image"},
  {"modelId":null,"page":"gemini-omni-1-1-flash","description":"google/gemini-omni-flash-1-1, video, 360p with video input","credits":168,"unit":"video","unitText":"per video"},
  {"modelId":null,"page":"gemini-omni-1-1-flash","description":"google/gemini-omni-flash-1-1, video, 720p with video input","credits":168,"unit":"video","unitText":"per video"},
  {"modelId":null,"page":"gemini-omni-1-1-flash","description":"google/gemini-omni-flash-1-1, video, 1080p with video input","credits":168,"unit":"video","unitText":"per video"},
  {"modelId":null,"page":"gemini-omni-1-1-flash","description":"google/gemini-omni-flash-1-1, video, 10s 360p no video input","credits":126,"unit":"video","unitText":"per video"},
  {"modelId":null,"page":"gemini-omni-1-1-flash","description":"google/gemini-omni-flash-1-1, video, 10s 720p no video input","credits":126,"unit":"video","unitText":"per video"},
  {"modelId":null,"page":"gemini-omni-1-1-flash","description":"google/gemini-omni-flash-1-1, video, 10s 1080p no video input","credits":126,"unit":"video","unitText":"per video"},
  {"modelId":null,"page":"gemini-omni-1-1-flash","description":"google/gemini-omni-flash-1-1, video, 4k with video input","credits":252,"unit":"video","unitText":"per video"},
  {"modelId":null,"page":"gemini-omni-1-1-flash","description":"google/gemini-omni-flash-1-1, video, 10s 4k no video input","credits":210,"unit":"video","unitText":"per video"},
  {"modelId":null,"page":"gemini-omni-1-1-flash","description":"google/gemini-omni-flash-1-1, video, 8s 360p no video input","credits":105,"unit":"video","unitText":"per video"},
  {"modelId":null,"page":"gemini-omni-1-1-flash","description":"google/gemini-omni-flash-1-1, video, 8s 720p no video input","credits":105,"unit":"video","unitText":"per video"},
  {"modelId":null,"page":"gemini-omni-1-1-flash","description":"google/gemini-omni-flash-1-1, video, 8s 1080p no video input","credits":105,"unit":"video","unitText":"per video"},
  {"modelId":null,"page":"gemini-omni-1-1-flash","description":"google/gemini-omni-flash-1-1, video, 8s 4k no video input","credits":189,"unit":"video","unitText":"per video"},
  {"modelId":null,"page":"gemini-omni-1-1-flash","description":"google/gemini-omni-flash-1-1, video, 6s 360p no video input","credits":84,"unit":"video","unitText":"per video"},
  {"modelId":null,"page":"gemini-omni-1-1-flash","description":"google/gemini-omni-flash-1-1, video, 6s 720p no video input","credits":84,"unit":"video","unitText":"per video"},
  {"modelId":null,"page":"gemini-omni-1-1-flash","description":"google/gemini-omni-flash-1-1, video, 6s 1080p no video input","credits":84,"unit":"video","unitText":"per video"},
  {"modelId":null,"page":"gemini-omni-1-1-flash","description":"google/gemini-omni-flash-1-1, video, 6s 4k no video input","credits":168,"unit":"video","unitText":"per video"},
  {"modelId":null,"page":"gemini-omni-1-1-flash","description":"google/gemini-omni-flash-1-1, video, 4s 360p no video input","credits":63,"unit":"video","unitText":"per video"},
  {"modelId":null,"page":"gemini-omni-1-1-flash","description":"google/gemini-omni-flash-1-1, video, 4s 720p no video input","credits":63,"unit":"video","unitText":"per video"},
  {"modelId":null,"page":"gemini-omni-1-1-flash","description":"google/gemini-omni-flash-1-1, video, 4s 1080p no video input","credits":63,"unit":"video","unitText":"per video"},
  {"modelId":null,"page":"gemini-omni-1-1-flash","description":"google/gemini-omni-flash-1-1, video, 4s 4k no video input","credits":147,"unit":"video","unitText":"per video"},
  {"modelId":null,"page":"seedance-2-5","description":"bytedance/seedance-2-5, 1080p with video","credits":95,"unit":"second","unitText":"per second"},
  {"modelId":null,"page":"seedance-2-5","description":"bytedance/seedance-2-5, 1080p no video","credits":158,"unit":"second","unitText":"per second"},
  {"modelId":null,"page":"seedance-2-5","description":"bytedance/seedance-2-5, 720p with video","credits":38,"unit":"second","unitText":"per second"},
  {"modelId":null,"page":"seedance-2-5","description":"bytedance/seedance-2-5, 720p no video","credits":63,"unit":"second","unitText":"per second"},
  {"modelId":null,"page":"seedance-2-5","description":"bytedance/seedance-2-5, 480p with video","credits":17,"unit":"second","unitText":"per second"},
  {"modelId":null,"page":"seedance-2-5","description":"bytedance/seedance-2-5, 480p no video","credits":28,"unit":"second","unitText":"per second"},
  {"modelId":null,"page":"seedance-2-0-mini","description":"bytedance/seedance-2-mini, 720P no video","credits":8.2,"unit":"second","unitText":"per second"},
  {"modelId":null,"page":"seedance-2-0-mini","description":"bytedance/seedance-2-mini, 720P with video","credits":5,"unit":"second","unitText":"per second"},
  {"modelId":null,"page":"seedance-2-0-mini","description":"bytedance/seedance-2-mini, 480P no video","credits":3.8,"unit":"second","unitText":"per second"},
  {"modelId":null,"page":"seedance-2-0-mini","description":"bytedance/seedance-2-mini, 480P with video","credits":2.4,"unit":"second","unitText":"per second"},
  {"modelId":"gpt-image-2-image-to-image","page":"gpt-image-2","description":"gpt image 2, image-to-image, 4k","credits":16,"unit":"image","unitText":"per image"},
  {"modelId":"gpt-image-2-image-to-image","page":"gpt-image-2","description":"gpt image 2, image-to-image, 2k","credits":10,"unit":"image","unitText":"per image"},
  {"modelId":"gpt-image-2-image-to-image","page":"gpt-image-2","description":"gpt image 2, image-to-image, 1k","credits":6,"unit":"image","unitText":"per image"},
  {"modelId":"gpt-image-2-text-to-image","page":"gpt-image-2","description":"gpt image 2, text-to-image, 4k","credits":16,"unit":"image","unitText":"per image"},
  {"modelId":"gpt-image-2-text-to-image","page":"gpt-image-2","description":"gpt image 2, text-to-image, 2k","credits":10,"unit":"image","unitText":"per image"},
  {"modelId":"gpt-image-2-text-to-image","page":"gpt-image-2","description":"gpt image 2, text-to-image, 1k","credits":6,"unit":"image","unitText":"per image"},
  {"modelId":"bytedance/seedance-2-fast","page":"seedance-2-0","description":"bytedance/seedance-2 fast, 720p no video input","credits":24.8,"unit":"second","unitText":"per second"},
  {"modelId":"bytedance/seedance-2-fast","page":"seedance-2-0","description":"bytedance/seedance-2 fast, 720p with video input","credits":15,"unit":"second","unitText":"per second"},
  {"modelId":"bytedance/seedance-2-fast","page":"seedance-2-0","description":"bytedance/seedance-2 fast, 480p no video input","credits":11.7,"unit":"second","unitText":"per second"},
  {"modelId":"bytedance/seedance-2-fast","page":"seedance-2-0","description":"bytedance/seedance-2 fast, 480p with video input","credits":6.8,"unit":"second","unitText":"per second"},
  {"modelId":"bytedance/seedance-2","page":"seedance-2-0","description":"bytedance/seedance-2, 4K no video input","credits":208,"unit":"second","unitText":"per second"},
  {"modelId":"bytedance/seedance-2","page":"seedance-2-0","description":"bytedance/seedance-2, 4K with video input","credits":128,"unit":"second","unitText":"per second"},
  {"modelId":"bytedance/seedance-2","page":"seedance-2-0","description":"bytedance/seedance-2, 1080p with video input","credits":62,"unit":"second","unitText":"per second"},
  {"modelId":"bytedance/seedance-2","page":"seedance-2-0","description":"bytedance/seedance-2, 1080p no video input","credits":102,"unit":"second","unitText":"per second"},
  {"modelId":"bytedance/seedance-2","page":"seedance-2-0","description":"bytedance/seedance-2, 720p no video input","credits":41,"unit":"second","unitText":"per second"},
  {"modelId":"bytedance/seedance-2","page":"seedance-2-0","description":"bytedance/seedance-2, 720p with video input","credits":25,"unit":"second","unitText":"per second"},
  {"modelId":"bytedance/seedance-2","page":"seedance-2-0","description":"bytedance/seedance-2, 480p no video input","credits":19,"unit":"second","unitText":"per second"},
  {"modelId":"bytedance/seedance-2","page":"seedance-2-0","description":"bytedance/seedance-2, 480p with video input","credits":11.5,"unit":"second","unitText":"per second"},
  {"modelId":null,"page":"nano-banana-2","description":"Google nano banana 2, 4K","credits":18,"unit":"image","unitText":"per image"},
  {"modelId":null,"page":"nano-banana-2","description":"Google nano banana 2, 2K","credits":12,"unit":"image","unitText":"per image"},
  {"modelId":null,"page":"nano-banana-2","description":"Google nano banana 2, 1K","credits":8,"unit":"image","unitText":"per image"},
  {"modelId":"kling-2.6/image-to-video","page":"kling-2-6","description":"kling 2.6, image-to-video, without audio-10.0s","credits":110,"unit":"video","unitText":"per video"},
  {"modelId":"kling-2.6/image-to-video","page":"kling-2-6","description":"kling 2.6, image-to-video, with audio-10.0s","credits":220,"unit":"video","unitText":"per video"},
  {"modelId":"kling-2.6/image-to-video","page":"kling-2-6","description":"kling 2.6, image-to-video, with audio-5.0s","credits":110,"unit":"video","unitText":"per video"},
  {"modelId":null,"page":"kling-2-6","description":"kling 2.6, image-to-video, without audio-5.0s","credits":55,"unit":"video","unitText":"per video"},
  {"modelId":"flux-2/pro-text-to-image","page":"flux-2","description":"Black Forest Labs flux-2 pro, text-to-image, 1.0s-2K","credits":7,"unit":"image","unitText":"per image"},
  {"modelId":"flux-2/pro-text-to-image","page":"flux-2","description":"Black Forest Labs flux-2 pro, text-to-image, 1.0s-1K","credits":5,"unit":"image","unitText":"per image"},
  {"modelId":null,"page":"nano-banana-pro","description":"Google nano banana pro, 1/2K","credits":18,"unit":"image","unitText":"per image"},
  {"modelId":null,"page":"nano-banana-pro","description":"Google nano banana pro, 4K","credits":24,"unit":"image","unitText":"per image"},
  {"modelId":null,"page":"veo-3-1","description":"Google veo 3.1, reference-to-video, Lite-4k","credits":150,"unit":"video","unitText":"per video"},
  {"modelId":null,"page":"veo-3-1","description":"Google veo 3.1, reference-to-video, Lite-1080p","credits":35,"unit":"video","unitText":"per video"},
  {"modelId":null,"page":"veo-3-1","description":"Google veo 3.1, reference-to-video, Lite-720p","credits":30,"unit":"video","unitText":"per video"},
  {"modelId":null,"page":"veo-3-1","description":"Google veo 3.1, reference-to-video, Fast-4k","credits":180,"unit":"video","unitText":"per video"},
  {"modelId":null,"page":"veo-3-1","description":"Google veo 3.1, reference-to-video, Fast-1080p","credits":65,"unit":"video","unitText":"per video"},
  {"modelId":"veo/extend","page":"veo-3-1","description":"Google veo 3.1, Extend, Lite","credits":30,"unit":"video","unitText":"per vedio"},
  {"modelId":null,"page":"veo-3-1","description":"Google veo 3.1, text-to-video, Quality-4K","credits":370,"unit":"video","unitText":"per video"},
  {"modelId":null,"page":"veo-3-1","description":"Google veo 3.1, image-to-video, Quality-4K","credits":370,"unit":"video","unitText":"per video"},
  {"modelId":null,"page":"veo-3-1","description":"Google veo 3.1, text-to-video, Quality-1080p","credits":255,"unit":"video","unitText":"per video"},
  {"modelId":null,"page":"veo-3-1","description":"Google veo 3.1, image-to-video, Quality-1080p","credits":255,"unit":"video","unitText":"per video"},
  {"modelId":null,"page":"veo-3-1","description":"Google veo 3.1, text-to-video, Quality-720p","credits":250,"unit":"video","unitText":"per video"},
  {"modelId":null,"page":"veo-3-1","description":"Google veo 3.1, image-to-video, Quality-720p","credits":250,"unit":"video","unitText":"per video"},
  {"modelId":null,"page":"veo-3-1","description":"Google veo 3.1, text-to-video, Fast-4K","credits":180,"unit":"video","unitText":"per video"},
  {"modelId":null,"page":"veo-3-1","description":"Google veo 3.1, image-to-video, Fast-4K","credits":180,"unit":"video","unitText":"per video"},
  {"modelId":null,"page":"veo-3-1","description":"Google veo 3.1, text-to-video, Fast-1080p","credits":65,"unit":"video","unitText":"per video"},
  {"modelId":null,"page":"veo-3-1","description":"Google veo 3.1, image-to-video, Fast-1080p","credits":65,"unit":"video","unitText":"per video"},
  {"modelId":null,"page":"veo-3-1","description":"Google veo 3.1, text-to-video, Fast-720p","credits":60,"unit":"video","unitText":"per video"},
  {"modelId":null,"page":"veo-3-1","description":"Google veo 3.1, image-to-video, Fast-720p","credits":60,"unit":"video","unitText":"per video"},
  {"modelId":null,"page":"veo-3-1","description":"Google veo 3.1, text-to-video, Lite-4K","credits":150,"unit":"video","unitText":"per video"},
  {"modelId":null,"page":"veo-3-1","description":"Google veo 3.1, image-to-video, Lite-4K","credits":150,"unit":"video","unitText":"per video"},
  {"modelId":null,"page":"veo-3-1","description":"Google veo 3.1, text-to-video, Lite-1080p","credits":35,"unit":"video","unitText":"per video"},
  {"modelId":null,"page":"veo-3-1","description":"Google veo 3.1, image-to-video, Lite-1080p","credits":35,"unit":"video","unitText":"per video"},
  {"modelId":null,"page":"veo-3-1","description":"Google veo 3.1, text-to-video, Lite-720p","credits":30,"unit":"video","unitText":"per video"},
  {"modelId":null,"page":"veo-3-1","description":"Google veo 3.1, image-to-video, Lite-720p","credits":30,"unit":"video","unitText":"per video"},
  {"modelId":"veo/extend","page":"veo-3-1","description":"Google veo 3.1, Extend, Quality","credits":250,"unit":"video","unitText":"per video"},
  {"modelId":"veo/extend","page":"veo-3-1","description":"Google veo 3.1, Extend, Fast","credits":60,"unit":"video","unitText":"per video"},
  {"modelId":"veo/get-1080p-video","page":"veo-3-1","description":"Google veo 3.1, Get 1080P Video","credits":5,"unit":"video","unitText":"per video"},
  {"modelId":null,"page":"veo-3-1","description":"Google veo 3.1, reference-to-video, Fast-720p","credits":60,"unit":"video","unitText":"per video"},
  {"modelId":"kling/v2-5-turbo-text-to-video-pro","page":"kling-2-5","description":"kling 2.5 turbo, text-to-video, Turbo Pro-10.0s","credits":84,"unit":"video","unitText":"per video"},
  {"modelId":"kling/v2-5-turbo-text-to-video-pro","page":"kling-2-5","description":"kling 2.5 turbo, text-to-video, Turbo Pro-5.0s","credits":42,"unit":"video","unitText":"per video"},
  {"modelId":null,"page":"topaz-video-upscaler","description":"Topaz Video Upscaler, upscale factor 4x","credits":14,"unit":"second","unitText":"per second"},
  {"modelId":null,"page":"topaz-video-upscaler","description":"Topaz Video Upscaler, upscale factor 1x/2x","credits":8,"unit":"second","unitText":"per second"},
  {"modelId":"elevenlabs/text-to-speech-multilingual-v2","page":"elevenlabs-tts","description":"Elevenlabs Text to Speech, multilingual v2","credits":12,"unit":"other","unitText":"per 1000 characters"},
  {"modelId":"runway/extend-ai-video","page":"runway-api","description":"Runway, extend-ai-video, 1080p","credits":30,"unit":"video","unitText":"per video"},
  {"modelId":"runway/extend-ai-video","page":"runway-api","description":"Runway, extend-ai-video, 720p","credits":12,"unit":"video","unitText":"per video"},
  {"modelId":null,"page":"runway-api","description":"Runway, text-to-video, 5.0s-720p","credits":12,"unit":"video","unitText":"per video"},
  {"modelId":null,"page":"runway-api","description":"Runway, text-to-video, 10.0s-720p","credits":30,"unit":"video","unitText":"per video"},
  {"modelId":null,"page":"runway-api","description":"Runway, text-to-video, 5.0s-1080p","credits":30,"unit":"video","unitText":"per video"},
  {"modelId":null,"page":"runway-api","description":"Runway, image-to-video, 5.0s-720p","credits":12,"unit":"video","unitText":"per video"},
  {"modelId":null,"page":"runway-api","description":"Runway, image-to-video, 10.0s-720p","credits":30,"unit":"video","unitText":"per video"},
  {"modelId":null,"page":"runway-api","description":"Runway, image-to-video, 5.0s-1080p","credits":30,"unit":"video","unitText":"per video"},
  {"modelId":null,"page":"topaz-image-upscale","description":"Topaz Image Upscaler, image-upscale, 4K","credits":20,"unit":"image","unitText":"per image"},
  {"modelId":null,"page":"topaz-image-upscale","description":"Topaz Image Upscaler, image-upscale, 2K","credits":10,"unit":"image","unitText":"per image"},
]

const list = { rows: ROWS, learned: [] as LearnedPrice[] }
const est = (id: string, input: Record<string, unknown>, count = 1, prices = list) => estimateCredits(MODELS[id], input, prices, count)

describe('estimateCredits — price list', () => {
  it('prices GPT Image 2 per image by resolution, and fills the form default when none is set', () => {
    expect(est('gpt-image-2-text-to-image', { resolution: '2K' })).toEqual({ credits: 10, basis: 'price-list', detail: '10/image, 2K' })
    expect(est('gpt-image-2-text-to-image', { resolution: '4K' })?.credits).toBe(16)
    expect(est('gpt-image-2-text-to-image', {})?.credits).toBe(6) // the form sends the first option, 1K
    expect(est('gpt-image-2-text-to-image', { resolution: '2K' }, 4)).toMatchObject({ credits: 40, detail: '10/image × 4, 2K' })
  })

  it('reads "1/2K" as both 1K and 2K for Nano Banana Pro (an unlinked row found by its page name)', () => {
    expect(est('nano-banana-pro', { resolution: '1K' })?.credits).toBe(18)
    expect(est('nano-banana-pro', { resolution: '2K' })?.credits).toBe(18)
    expect(est('nano-banana-pro', { resolution: '4K' })?.credits).toBe(24)
  })

  it('keeps Nano Banana 2 off the 2.1 rows', () => {
    const pages = new Set(rowsForModel(MODELS['nano-banana-2'], ROWS).map((r) => r.page))
    expect([...pages]).toEqual(['nano-banana-2'])
    expect(est('nano-banana-2', { resolution: '4K' })?.credits).toBe(18)
  })

  it('multiplies Seedance 2 per-second prices by the duration and switches rate when a video goes in', () => {
    expect(est('bytedance/seedance-2', { resolution: '720p', duration: 8 })).toEqual({ credits: 328, basis: 'price-list', detail: '41/s × 8s, 720p' })
    expect(est('bytedance/seedance-2', { resolution: '720p', duration: 8, reference_video_urls: ['https://x/clip.mp4'] })).toEqual({
      credits: 200,
      basis: 'price-list',
      detail: '25/s × 8s, 720p with video input',
    })
    expect(est('bytedance/seedance-2', { resolution: '1080p', duration: 5, first_frame_url: 'https://x/a.png' })?.credits).toBe(510)
    expect(est('bytedance/seedance-2', {})?.credits).toBe(205) // defaults: 720p, 5s
  })

  it('picks Kling 3.0 Omni text-to-video by resolution and the audio switch', () => {
    expect(est('kling-3.0-omni/text-to-video', { resolution: '1080p', audio: true, duration: 8 })).toEqual({
      credits: 184,
      basis: 'price-list',
      detail: '23/s × 8s, 1080p with audio',
    })
    expect(est('kling-3.0-omni/text-to-video', { resolution: '1080p', audio: false, duration: 8 })?.credits).toBe(144)
    expect(est('kling-3.0-omni/text-to-video', {})).toMatchObject({ credits: 70, detail: '14/s × 5s, 720p no audio' })
  })

  it('prices Gemini Omni Flash per clip by length and resolution, flat with a video input', () => {
    expect(est('google/gemini-omni-flash-1-1', { duration: '8', resolution: '1080p' })).toMatchObject({ credits: 105, detail: '105/video, 1080p' })
    expect(est('google/gemini-omni-flash-1-1', { duration: '4', resolution: '4k' })?.credits).toBe(147)
    expect(est('google/gemini-omni-flash-1-1', { duration: '8', resolution: '720p', video_list: [{ url: 'https://x/v.mp4' }] })).toMatchObject({
      credits: 168,
      detail: '168/video, 720p with video input',
    })
  })

  it('prices ElevenLabs narration per 1000 characters of text', () => {
    expect(est('market/elevenlabs-tts', { text: 'a'.repeat(500) })).toEqual({ credits: 6, basis: 'price-list', detail: '12/1k chars × 500 chars' })
    expect(est('market/elevenlabs-tts', { text: '' })).toBeNull()
  })

  it('prices Veo by its model switch at 720p and never by the extend or upgrade rows', () => {
    expect(est('veo/generate', { model: 'veo3_fast' })).toEqual({ credits: 60, basis: 'price-list', detail: '60/video, fast 720p' })
    expect(est('veo/generate', { model: 'veo3', imageUrls: ['https://x/a.png'] })?.credits).toBe(250)
    expect(est('veo/generate', {})?.credits).toBe(60) // default veo3_fast
    expect(rowsForModel(MODELS['veo/generate'], ROWS).every((r) => r.page === 'veo-3-1' && !r.modelId)).toBe(true)
  })

  it('adopts an unlinked row that shares the model + operation prefix (Kling 2.6 5s without audio)', () => {
    expect(est('kling-2.6/image-to-video', { duration: '5', sound: false })?.credits).toBe(55)
    expect(est('kling-2.6/image-to-video', { duration: '5', sound: true })?.credits).toBe(110)
    expect(est('kling-2.6/image-to-video', { duration: '10', sound: true })).toMatchObject({ credits: 220, detail: '220/video, with audio' })
  })

  it('returns null rather than guess', () => {
    // Topaz's price depends on the output size, which depends on the picture.
    expect(est('topaz/image-upscale', { upscale_factor: '2' })).toBeNull()
    // Aleph has no row of its own; Runway's text-to-video is not it.
    expect(rowsForModel(MODELS['runway/aleph'], ROWS)).toEqual([])
    expect(est('runway/aleph', { prompt: 'x' })).toBeNull()
    // A per-second price with no duration to multiply by.
    const noDuration: ModelDefinition = {
      ...MODELS['bytedance/seedance-2'],
      fields: MODELS['bytedance/seedance-2'].fields.map((f) => (f.name === 'duration' ? { ...f, default: undefined, min: undefined } : f)),
    }
    expect(estimateCredits(noDuration, { resolution: '720p' }, list)).toBeNull()
    // No rows at all.
    expect(estimateCredits({ ...MODELS['nano-banana-pro'], id: 'acme/unknown', model: 'acme/unknown' }, {}, list)).toBeNull()
    // Two variants left with different prices: Veo extend has no tier switch.
    expect(estimateCredits({ ...MODELS['veo/generate'], id: 'veo/extend', model: 'veo/extend', fields: [] }, {}, list)).toBeNull()
  })
})

describe('estimateCredits — learned charges', () => {
  const learned: LearnedPrice[] = [{ modelId: 'gpt-image-2-text-to-image', key: 'resolution=2k', credits: 9.5, samples: 5, lastAt: 1 }]
  const prices = { rows: ROWS, learned }

  it('prefers what Kie last charged for the same key', () => {
    expect(est('gpt-image-2-text-to-image', { resolution: '2K', aspect_ratio: '16:9' }, 1, prices)).toEqual({
      credits: 9.5,
      basis: 'learned',
      detail: 'last charged 9.5',
    })
    expect(est('gpt-image-2-text-to-image', { resolution: '2K' }, 3, prices)).toMatchObject({ credits: 28.5, detail: 'last charged 9.5 × 3' })
  })

  it('falls back to the list when the key differs', () => {
    expect(est('gpt-image-2-text-to-image', { resolution: '1K' }, 1, prices)).toMatchObject({ credits: 6, basis: 'price-list' })
  })

  it('builds the same key as the server for the same payload', () => {
    // Pinned in server/studio/pricing.test.ts too.
    expect(learnedKey({ prompt: 'x', resolution: '720p', duration: 7, aspect_ratio: '9:16', generate_audio: false })).toBe(
      'resolution=720p|duration=7|generate_audio=false',
    )
    expect(learnedKey({ duration: '5' })).toBe(learnedKey({ duration: 5 }))
    expect(learnedKey({ reference_video_urls: ['https://x/v.mp4'], reference_image_urls: [] })).toBe('video_input=true')
  })
})

/** Sample jobs: the input Kie got and what it charged. The list alone should land on the same number. */
const CHARGED: [string, Record<string, unknown>, number][] = [
  ['gpt-image-2-text-to-image', { aspect_ratio: '1:1', resolution: '2K' }, 10],
  ['gpt-image-2-text-to-image', { aspect_ratio: '4:5', resolution: '1K' }, 6],
  ['flux-2/pro-text-to-image', { aspect_ratio: '3:4', resolution: '2K' }, 7],
  ['nano-banana-pro', { aspect_ratio: '16:9', resolution: '1K', output_format: 'png', image_input: ['https://x/a.png'] }, 18],
  ['nano-banana-2', { aspect_ratio: '1:1', resolution: '1K', output_format: 'jpg' }, 8],
  ['kling/v2-5-turbo-text-to-video-pro', { duration: '5', aspect_ratio: '16:9', cfg_scale: 0.5 }, 42],
  ['bytedance/seedance-2-mini', { duration: 7, resolution: '720p', aspect_ratio: '9:16', generate_audio: false, first_frame_url: 'https://x/a.png' }, 57.4],
]

describe('estimateCredits — against real charges', () => {
  it.each(CHARGED)('%s %j → %d', (id, input, charged) => {
    expect(est(id, input)?.credits).toBe(charged)
  })
})

describe('usePricing', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('fetches once per page load and unwraps { data }', async () => {
    vi.resetModules()
    const data = { fetchedAt: '2026-10-11T00:00:00.000Z', rows: ROWS.slice(0, 2), learned: [] }
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const { usePricing } = await import('./pricing.ts')
    const a = renderHook(() => usePricing())
    const b = renderHook(() => usePricing())
    await waitFor(() => expect(a.result.current).toEqual(data))
    await waitFor(() => expect(b.result.current).toEqual(data))
    expect(renderHook(() => usePricing()).result.current).toEqual(data) // later mounts get it at once
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith('/api/studio/pricing')
  })
})
