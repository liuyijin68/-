import { Controller, Post, Body, UploadedFile, UseInterceptors, HttpCode } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { S3Storage, LLMClient, TTSClient, ASRClient, Config } from 'coze-coding-dev-sdk';

interface WordEntry {
  word: string;
  meanings: string[];
  date: string;
}

// In-memory word banks (server-side, resets on restart)
let newWordBank: WordEntry[] = [];
let reviewWordBank: WordEntry[] = [];

@Controller('dictation')
export class DictationController {
  private storage: S3Storage;
  private llmClient: LLMClient;
  private ttsClient: TTSClient;
  private asrClient: ASRClient;

  constructor() {
    const config = new Config();
    this.storage = new S3Storage({
      endpointUrl: process.env.COZE_BUCKET_ENDPOINT_URL,
      accessKey: '',
      secretKey: '',
      bucketName: process.env.COZE_BUCKET_NAME,
      region: 'cn-beijing',
    });
    this.llmClient = new LLMClient(config);
    this.ttsClient = new TTSClient(config);
    this.asrClient = new ASRClient(config);
  }

  // ========== Image Upload ==========
  // Fix: Use S3Storage.uploadFile() + generatePresignedUrl() (correct SDK API)
  @Post('upload-image')
  @HttpCode(200)
  @UseInterceptors(FileInterceptor('image'))
  async uploadImage(@UploadedFile() file: Express.Multer.File) {
    console.log('[upload-image] file received:', file?.originalname, 'size:', file?.buffer?.length);

    let content: Buffer;
    if (file.path) {
      const fs = await import('fs');
      content = fs.readFileSync(file.path);
    } else if (file.buffer) {
      content = file.buffer;
    } else {
      return { code: 400, msg: '无法获取文件内容', data: null };
    }

    const timestamp = Date.now();
    const fileName = `dictation/${timestamp}_${file.originalname || 'photo.jpg'}`;

    // Fix: S3Storage uses uploadFile({ fileContent, fileName, contentType })
    const fileKey = await this.storage.uploadFile({
      fileContent: content,
      fileName,
      contentType: file.mimetype || 'image/jpeg',
    });

    // Fix: Use generatePresignedUrl to get accessible URL
    const imageUrl = await this.storage.generatePresignedUrl({
      key: fileKey,
      expireTime: 86400,
    });

    console.log('[upload-image] uploaded key:', fileKey);
    console.log('[upload-image] imageUrl:', imageUrl);
    return { code: 200, msg: 'success', data: { imageUrl, fileKey } };
  }

  // ========== Recognize All Words from Image ==========
  // Fix: LLMClient.invoke(messages, llmConfig) — two args; LLMResponse = { content: string }
  @Post('recognize-all-words')
  @HttpCode(200)
  async recognizeAllWords(@Body() body: { imageUrl: string }) {
    const { imageUrl } = body;
    console.log('[recognize-all-words] imageUrl:', imageUrl);

    try {
      // Fix: invoke(messages, llmConfig) — correct signature
      const llmResponse = await this.llmClient.invoke(
        [
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: { url: imageUrl },
              },
              {
                type: 'text',
                text: `This is a photo of English vocabulary words. Each line contains a word/phrase, possibly followed by phonetic symbols (after a "/" symbol), then part of speech and Chinese meanings.

Please extract ALL English words and phrases from this image. Return ONLY a JSON array of strings, like this format:
["word1", "word2", "phrase with spaces", "word3"]

Rules:
- Extract only the English word or phrase from each line
- If a line has a "/" symbol, the text before "/" is the word/phrase
- Include multi-word phrases like "put up", "at the back (of)" as complete strings
- Do NOT include phonetic symbols, parts of speech, or Chinese meanings
- Return ONLY the JSON array, no other text`,
              },
            ],
          },
        ],
        { model: 'doubao-seed-2-0-lite-260215', temperature: 0.3 },
      );

      // Fix: LLMResponse has only { content: string }
      const content: string = llmResponse?.content || '';
      console.log('[recognize-all-words] LLM content:', content.substring(0, 500));

      // Try to extract JSON array from the response
      let words: string[] = [];
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        try {
          words = JSON.parse(jsonMatch[0]);
        } catch {
          // Fallback: split by comma and clean
          words = jsonMatch[0]
            .replace(/[\[\]"]/g, '')
            .split(',')
            .map((w: string) => w.trim())
            .filter((w: string) => w.length > 0);
        }
      }

      console.log('[recognize-all-words] extracted words:', words);

      if (words.length === 0) {
        return { code: 200, msg: 'success', data: { words: [], count: 0 } };
      }

      // Translate each word to get Chinese meanings
      const wordsWithMeanings: WordEntry[] = [];
      for (const word of words) {
        const meanings = await this.translateWord(word);
        wordsWithMeanings.push({
          word,
          meanings,
          date: new Date().toISOString().split('T')[0],
        });
      }

      // Overwrite new word bank
      newWordBank = wordsWithMeanings;

      return {
        code: 200,
        msg: 'success',
        data: {
          words: wordsWithMeanings.map(w => ({ word: w.word, meanings: w.meanings })),
          count: wordsWithMeanings.length,
        },
      };
    } catch (error: any) {
      console.error('[recognize-all-words] error:', error?.message || error);
      return { code: 500, msg: '识别失败: ' + (error?.message || '未知错误'), data: null };
    }
  }

  // ========== Translate Word (get all meanings) ==========
  // Fix: invoke(messages, llmConfig) — correct signature; response.content
  private async translateWord(word: string): Promise<string[]> {
    try {
      const response = await this.llmClient.invoke(
        [
          {
            role: 'user',
            content: `Translate the English word/phrase "${word}" into Chinese. List ALL possible meanings (different parts of speech, different contexts). Return ONLY a JSON array of Chinese strings, like: ["含义1", "含义2", "含义3"]. No other text.`,
          },
        ],
        { model: 'doubao-seed-2-0-lite-260215', temperature: 0.3 },
      );

      // Fix: response.content is the string
      const content: string = response?.content || '';
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        try {
          return JSON.parse(jsonMatch[0]);
        } catch {
          return [word]; // fallback
        }
      }
      return [word];
    } catch {
      return [word];
    }
  }

  // ========== Speak Word - Both US and UK Pronunciation ==========
  // Fix Bug 2: Use TTS SDK synthesize() to generate audio, with free Google TTS fallback
  @Post('speak-word-both')
  @HttpCode(200)
  async speakWordBoth(@Body() body: { word: string }) {
    const { word } = body;
    console.log('[speak-word-both] word:', word);

    // Helper: generate Google Translate TTS URL (free fallback)
    const googleTtsUrl = (text: string, lang: string) =>
      `https://translate.google.com/translate_tts?ie=UTF-8&tl=${lang}&client=tw-ob&q=${encodeURIComponent(text)}`;

    try {
      // Use TTS SDK with English-capable voice for US pronunciation
      const usResponse = await this.ttsClient.synthesize({
        uid: 'dictation-user',
        text: word,
        speaker: 'zh_female_vv_uranus_bigtts',
        audioFormat: 'mp3',
        sampleRate: 24000,
      });

      // For UK pronunciation, use male voice for variety
      const ukResponse = await this.ttsClient.synthesize({
        uid: 'dictation-user',
        text: word,
        speaker: 'zh_male_m191_uranus_bigtts',
        audioFormat: 'mp3',
        sampleRate: 24000,
      });

      console.log('[speak-word-both] US audio:', usResponse.audioUri);
      console.log('[speak-word-both] UK audio:', ukResponse.audioUri);

      return {
        code: 200,
        msg: 'success',
        data: {
          usAudioUrl: usResponse.audioUri,
          ukAudioUrl: ukResponse.audioUri,
        },
      };
    } catch (error: any) {
      console.error('[speak-word-both] TTS error:', error?.message || error);
      // Fallback: use Google Translate free TTS
      try {
        const response = await this.ttsClient.synthesize({
          uid: 'dictation-user',
          text: word,
          speaker: 'zh_female_vv_uranus_bigtts',
          audioFormat: 'mp3',
          sampleRate: 24000,
        });
        return {
          code: 200,
          msg: 'success (single voice fallback)',
          data: {
            usAudioUrl: response.audioUri,
            ukAudioUrl: response.audioUri,
          },
        };
      } catch {
        // Final fallback: Google Translate TTS (free, no auth needed)
        const usUrl = googleTtsUrl(word, 'en');
        const ukUrl = googleTtsUrl(word, 'en-GB');
        console.log('[speak-word-both] using Google TTS fallback:', usUrl);
        return {
          code: 200,
          msg: 'success (Google TTS fallback)',
          data: {
            usAudioUrl: usUrl,
            ukAudioUrl: ukUrl,
          },
        };
      }
    }
  }

  // ========== Upload Audio for ASR ==========
  // Fix: Upload audio file to storage, return URL for ASR
  @Post('upload-audio')
  @HttpCode(200)
  @UseInterceptors(FileInterceptor('audio'))
  async uploadAudio(@UploadedFile() file: Express.Multer.File) {
    console.log('[upload-audio] file received:', file?.originalname, 'size:', file?.buffer?.length);

    let content: Buffer;
    if (file.path) {
      const fs = await import('fs');
      content = fs.readFileSync(file.path);
    } else if (file.buffer) {
      content = file.buffer;
    } else {
      return { code: 400, msg: '无法获取音频文件内容', data: null };
    }

    const timestamp = Date.now();
    const fileName = `dictation/audio/${timestamp}_${file.originalname || 'recording.wav'}`;

    const fileKey = await this.storage.uploadFile({
      fileContent: content,
      fileName,
      contentType: file.mimetype || 'audio/wav',
    });

    const audioUrl = await this.storage.generatePresignedUrl({
      key: fileKey,
      expireTime: 86400,
    });

    console.log('[upload-audio] audioUrl:', audioUrl);
    return { code: 200, msg: 'success', data: { audioUrl, fileKey } };
  }

  // ========== Handwriting Recognition ==========
  // Fix Bug 5: Use LLM vision to recognize handwritten English from canvas image
  @Post('recognize-handwriting')
  @HttpCode(200)
  async recognizeHandwriting(@Body() body: { imageUrl: string }) {
    const { imageUrl } = body;
    console.log('[recognize-handwriting] imageUrl:', imageUrl);

    try {
      const llmResponse = await this.llmClient.invoke(
        [
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: { url: imageUrl },
              },
              {
                type: 'text',
                text: 'This is a photo of handwritten English text on a canvas. Please recognize the handwritten English word or phrase. Return ONLY the recognized text as a plain string, no other text or explanation.',
              },
            ],
          },
        ],
        { model: 'doubao-seed-2-0-lite-260215', temperature: 0.1 },
      );

      const text = (llmResponse?.content || '').trim();
      console.log('[recognize-handwriting] recognized:', text);

      return {
        code: 200,
        msg: 'success',
        data: { text },
      };
    } catch (error: any) {
      console.error('[recognize-handwriting] error:', error?.message || error);
      return { code: 500, msg: '手写识别失败: ' + (error?.message || '未知错误'), data: null };
    }
  }

  // ========== ASR - Speech Recognition ==========
  // Fix: Use ASR SDK to recognize Chinese speech from audio URL
  @Post('recognize-speech')
  @HttpCode(200)
  async recognizeSpeech(@Body() body: { audioUrl: string }) {
    const { audioUrl } = body;
    console.log('[recognize-speech] audioUrl:', audioUrl);

    try {
      const result = await this.asrClient.recognize({
        uid: 'dictation-user',
        url: audioUrl,
      });

      console.log('[recognize-speech] recognized text:', result.text);

      return {
        code: 200,
        msg: 'success',
        data: { text: result.text },
      };
    } catch (error: any) {
      console.error('[recognize-speech] ASR error:', error?.message || error);
      return {
        code: 500,
        msg: '语音识别失败: ' + (error?.message || 'unknown'),
        data: null,
      };
    }
  }

  // ========== Check Answer - Multi-meaning support ==========
  // Fix: trim both sides, case-insensitive comparison, remove punctuation
  @Post('check-answer')
  @HttpCode(200)
  async checkAnswer(@Body() body: { word: string; correctMeanings: string[]; userAnswer: string }) {
    const { word, correctMeanings, userAnswer } = body;

    // Fix Bug 4: trim whitespace, normalize, remove punctuation
    const normalizedAnswer = userAnswer.trim().toLowerCase().replace(/[，,。.！!？?；;：:、\s]+/g, '');
    const normalizedMeanings = correctMeanings.map(m =>
      m.trim().toLowerCase().replace(/[，,。.！!？?；;：:、\s]+/g, ''),
    );

    console.log('[check-answer] word:', word);
    console.log('[check-answer] userAnswer (normalized):', normalizedAnswer);
    console.log('[check-answer] correctMeanings (normalized):', normalizedMeanings);

    // Check if user's answer matches any of the correct meanings
    const isCorrect = normalizedMeanings.some(meaning => {
      // Exact match after normalization
      if (normalizedAnswer === meaning) return true;
      // Contains match (user might say part of the meaning)
      if (meaning.includes(normalizedAnswer) && normalizedAnswer.length >= 1) return true;
      if (normalizedAnswer.includes(meaning) && meaning.length >= 1) return true;
      return false;
    });

    console.log('[check-answer] isCorrect:', isCorrect);

    return {
      code: 200,
      msg: 'success',
      data: { isCorrect },
    };
  }

  // ========== Word Bank Management ==========

  @Post('get-new-words')
  @HttpCode(200)
  async getNewWords() {
    return { code: 200, msg: 'success', data: { words: newWordBank } };
  }

  @Post('get-review-words')
  @HttpCode(200)
  async getReviewWords() {
    return { code: 200, msg: 'success', data: { words: reviewWordBank } };
  }

  @Post('add-to-review')
  @HttpCode(200)
  async addToReview(@Body() body: { word: string; meanings: string[] }) {
    const { word, meanings } = body;
    const exists = reviewWordBank.find(w => w.word === word);
    if (!exists) {
      reviewWordBank.push({
        word,
        meanings,
        date: new Date().toISOString().split('T')[0],
      });
    }
    console.log('[add-to-review] review bank size:', reviewWordBank.length);
    return { code: 200, msg: 'success', data: { words: reviewWordBank } };
  }

  @Post('remove-from-review')
  @HttpCode(200)
  async removeFromReview(@Body() body: { word: string }) {
    const { word } = body;
    reviewWordBank = reviewWordBank.filter(w => w.word !== word);
    console.log('[remove-from-review] review bank size:', reviewWordBank.length);
    return { code: 200, msg: 'success', data: { words: reviewWordBank } };
  }

  @Post('add-word')
  @HttpCode(200)
  async addWord(@Body() body: { word: string; meanings: string[]; bank: 'new' | 'review' }) {
    const { word, meanings, bank } = body;
    const entry: WordEntry = { word, meanings, date: new Date().toISOString().split('T')[0] };

    if (bank === 'new') {
      const exists = newWordBank.find(w => w.word === word);
      if (!exists) newWordBank.push(entry);
      return { code: 200, msg: 'success', data: { words: newWordBank } };
    } else {
      const exists = reviewWordBank.find(w => w.word === word);
      if (!exists) reviewWordBank.push(entry);
      return { code: 200, msg: 'success', data: { words: reviewWordBank } };
    }
  }

  @Post('remove-word')
  @HttpCode(200)
  async removeWord(@Body() body: { word: string; bank: 'new' | 'review' }) {
    const { word, bank } = body;
    if (bank === 'new') {
      newWordBank = newWordBank.filter(w => w.word !== word);
      return { code: 200, msg: 'success', data: { words: newWordBank } };
    } else {
      reviewWordBank = reviewWordBank.filter(w => w.word !== word);
      return { code: 200, msg: 'success', data: { words: reviewWordBank } };
    }
  }
}
