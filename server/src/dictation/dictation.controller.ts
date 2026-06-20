import { Controller, Post, Body, UploadedFile, UseInterceptors, HttpCode } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { S3Storage, LLMClient, TTSClient, ASRClient, Config } from 'coze-coding-dev-sdk';
import axios from 'axios'; // Fix 第五版: 用于下载TTS音频并上传到自己的存储

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

  // Fix 第四版: 统一清洗函数 — 只取英文部分
  private cleanWord(raw: string): string {
    // 1. 找到第一个 / 或中文字符的位置
    const slashIdx = raw.indexOf('/');
    const chineseIdx = raw.search(/[\u4e00-\u9fa5]/);
    let endIdx = raw.length;
    if (slashIdx !== -1 && slashIdx < endIdx) endIdx = slashIdx;
    if (chineseIdx !== -1 && chineseIdx < endIdx) endIdx = chineseIdx;
    
    // 2. 截取并清理多余字符（保留字母、空格、括号、连字符）
    let cleaned = raw.substring(0, endIdx).trim();
    cleaned = cleaned.replace(/[^a-zA-Z\s\(\)\-]/g, '').trim();
    return cleaned;
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
  // Fix 第四版: 统一清洗 — 无论JSON还是fallback，都调用cleanWord
  @Post('recognize-all-words')
  @HttpCode(200)
  async recognizeAllWords(@Body() body: { imageUrl: string }) {
    const { imageUrl } = body;
    console.log('[recognize-all-words] imageUrl:', imageUrl);
    
    try {
      const llmResponse = await this.llmClient.invoke(
        [
          {
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: imageUrl } },
              {
                type: 'text',
                text: `Extract all English words/phrases from this image. Return ONLY a JSON array of strings, each string is the English word/phrase (no extra symbols, no Chinese, no phonetic). Example: ["put up", "important", "at school"]`
              },
            ],
          },
        ],
        { model: 'doubao-seed-2-0-lite-260215', temperature: 0.2 }
      );
      
      let content = llmResponse?.content || '';
      console.log('[recognize-all-words] LLM raw content:', content);
      
      let rawWords: string[] = [];
      
      // 1. 尝试提取 JSON 数组
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        try {
          rawWords = JSON.parse(jsonMatch[0]);
        } catch (e) {
          console.warn('JSON parse failed', e);
        }
      }
      
      // 2. 如果 JSON 失败，按行拆分（fallback）
      if (!rawWords.length) {
        const lines = content.split(/\r?\n/);
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          rawWords.push(trimmed);
        }
      }
      
      // 3. Fix 第四版: 统一清洗 — 每个候选词都提取英文部分
      const words = rawWords
        .map(w => this.cleanWord(w))
        .filter(w => w.length > 0);
      
      // 4. 去重
      const uniqueWords = [...new Set(words)];
      
      console.log('[recognize-all-words] cleaned words:', uniqueWords);
      
      if (uniqueWords.length === 0) {
        return { code: 200, msg: 'success', data: { words: [], count: 0, raw: content } };
      }
      
      // 翻译每个单词
      const wordsWithMeanings: WordEntry[] = [];
      for (const word of uniqueWords) {
        const meanings = await this.translateWord(word);
        wordsWithMeanings.push({ word, meanings, date: new Date().toISOString().split('T')[0] });
      }
      
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
      console.error('[recognize-all-words] error:', error);
      return { code: 500, msg: '识别失败: ' + (error?.message || ''), data: null };
    }
  }

  // ========== Translate Word (get all meanings) ==========
  // Fix 第四版: 防止空含义导致异常
  private async translateWord(word: string): Promise<string[]> {
    try {
      const response = await this.llmClient.invoke(
        [
          {
            role: 'user',
            content: `Translate "${word}" into Chinese. List ALL meanings as JSON array of strings. If no translation, return ["${word}"]`,
          },
        ],
        { model: 'doubao-seed-2-0-lite-260215', temperature: 0.3 },
      );

      const content: string = response?.content || '';
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        try {
          const arr = JSON.parse(jsonMatch[0]);
          return Array.isArray(arr) && arr.length ? arr : [word];
        } catch {
          return [word];
        }
      }
      return [word];
    } catch {
      return [word];
    }
  }

  // ========== Speak Word - Both US and UK Pronunciation ==========
  // Fix 第九版: 使用有道词典免费TTS (稳定可靠, 无需API Key)
  @Post('speak-word-both')
  @HttpCode(200)
  async speakWordBoth(@Body() body: { word: string }) {
    const { word } = body;
    console.log('[speak-word-both] word:', word);

    // 有道词典 TTS: type=0 美式, type=1 英式
    const fetchTts = async (text: string, type: number): Promise<Buffer | null> => {
      try {
        const url = `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(text)}&type=${type}`;
        console.log(`[speak-word-both] fetching: ${url}`);
        const res = await axios.get(url, {
          responseType: 'arraybuffer',
          timeout: 10000,
          headers: { 'User-Agent': 'Mozilla/5.0' },
        });
        if (res.status === 200 && res.data?.length > 100) {
          console.log(`[speak-word-both] Youdao TTS type=${type}: size=${res.data.length}`);
          return Buffer.from(res.data);
        }
        console.warn(`[speak-word-both] Youdao TTS type=${type}: unexpected response, size=${res.data?.length || 0}`);
        return null;
      } catch (e) {
        console.error(`[speak-word-both] Youdao TTS type=${type} failed:`, e?.message || e);
        return null;
      }
    };

    const uploadBuffer = async (buf: Buffer, suffix: string): Promise<string | null> => {
      try {
        const fileName = `dictation/tts/${Date.now()}_${word.replace(/\s+/g, '_')}_${suffix}.mp3`;
        const fileKey = await this.storage.uploadFile({
          fileContent: buf,
          fileName,
          contentType: 'audio/mpeg',
        });
        const audioUrl = await this.storage.generatePresignedUrl({ key: fileKey, expireTime: 86400 });
        console.log(`[speak-word-both] uploaded ${suffix}:`, audioUrl);
        return audioUrl;
      } catch (e) {
        console.error(`[speak-word-both] upload ${suffix} failed:`, e?.message || e);
        return null;
      }
    };

    // 美式发音: type=0
    const usBuf = await fetchTts(word, 0);
    // 英式发音: type=1
    const ukBuf = await fetchTts(word, 1);

    let usAudioUrl = usBuf ? await uploadBuffer(usBuf, 'us') : null;
    let ukAudioUrl = ukBuf ? await uploadBuffer(ukBuf, 'uk') : null;

    // 英式失败用美式
    if (!ukAudioUrl && usAudioUrl) ukAudioUrl = usAudioUrl;
    if (!usAudioUrl && ukAudioUrl) usAudioUrl = ukAudioUrl;

    // 全部失败：返回有道直链（H5可用，小程序需配置域名）
    if (!usAudioUrl) {
      usAudioUrl = `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(word)}&type=0`;
    }
    if (!ukAudioUrl) {
      ukAudioUrl = `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(word)}&type=1`;
    }

    return {
      code: 200,
      msg: 'success',
      data: { usAudioUrl: usAudioUrl || '', ukAudioUrl: ukAudioUrl || '' },
    };
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
