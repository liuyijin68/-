import { Controller, Post, Body, UploadedFile, UseInterceptors, HttpCode } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { S3Storage, LLMClient, Config } from 'coze-coding-dev-sdk';

interface WordEntry {
  word: string;
  meanings: string[];
  date: string;
}

// In-memory word bank (server-side, for initial import only)
let newWordBank: WordEntry[] = [];

@Controller('dictation')
export class DictationController {
  private storage: S3Storage;
  private llmClient: LLMClient;

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
  }

  private cleanWord(raw: string): string {
    const slashIdx = raw.indexOf('/');
    const chineseIdx = raw.search(/[\u4e00-\u9fa5]/);
    let endIdx = raw.length;
    if (slashIdx !== -1 && slashIdx < endIdx) endIdx = slashIdx;
    if (chineseIdx !== -1 && chineseIdx < endIdx) endIdx = chineseIdx;
    let cleaned = raw.substring(0, endIdx).trim();
    cleaned = cleaned.replace(/[^a-zA-Z\s\(\)\-]/g, '').trim();
    return cleaned;
  }

  // ========== Image Upload (TOS) ==========
  @Post('upload-image')
  @HttpCode(200)
  @UseInterceptors(FileInterceptor('file'))
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

    const fileKey = await this.storage.uploadFile({
      fileContent: content,
      fileName,
      contentType: file.mimetype || 'image/jpeg',
    });

    const imageUrl = await this.storage.generatePresignedUrl({
      key: fileKey,
      expireTime: 86400,
    });

    console.log('[upload-image] uploaded key:', fileKey);
    return { code: 200, msg: 'success', data: { imageUrl, fileKey } };
  }

  // ========== Recognize All Words from Image (LLM) ==========
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
                text: `Extract all English words/phrases from this image. Return ONLY a JSON array of strings, each string is the English word/phrase (no extra symbols, no Chinese, no phonetic). Example: ["put up", "important", "at school"]`,
              },
            ],
          },
        ],
        { model: 'doubao-seed-2-0-lite-260215', temperature: 0.2 },
      );

      let content = llmResponse?.content || '';
      console.log('[recognize-all-words] LLM raw content:', content);

      let rawWords: string[] = [];

      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        try {
          rawWords = JSON.parse(jsonMatch[0]);
        } catch (e) {
          console.warn('JSON parse failed', e);
        }
      }

      if (!rawWords.length) {
        const lines = content.split(/\r?\n/);
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          rawWords.push(trimmed);
        }
      }

      const words = rawWords
        .map(w => this.cleanWord(w))
        .filter(w => w.length > 0);

      const uniqueWords = [...new Set(words)];

      console.log('[recognize-all-words] cleaned words:', uniqueWords);

      if (uniqueWords.length === 0) {
        return { code: 200, msg: 'success', data: { words: [], count: 0, raw: content } };
      }

      const wordsWithMeanings: WordEntry[] = [];
      for (const word of uniqueWords) {
        const meanings = await this.translateWord(word);
        wordsWithMeanings.push({ word, meanings, date: new Date().toISOString().split('T')[0] });
      }

      // Append to server-side bank (for import-initial-words compatibility)
      const existingWords = new Set(newWordBank.map(w => w.word.toLowerCase()));
      const newEntries = wordsWithMeanings.filter(w => !existingWords.has(w.word.toLowerCase()));
      newWordBank = [...newEntries, ...newWordBank];
      console.log('[recognize-all-words] appended', newEntries.length, 'new words, total:', newWordBank.length);

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

  // ========== Translate Word (LLM) ==========
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

  // ========== Handwriting Recognition (LLM) ==========
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
              { type: 'image_url', image_url: { url: imageUrl } },
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

      return { code: 200, msg: 'success', data: { text } };
    } catch (error: any) {
      console.error('[recognize-handwriting] error:', error?.message || error);
      return { code: 500, msg: '手写识别失败: ' + (error?.message || '未知错误'), data: null };
    }
  }

  // ========== Import Initial Words ==========
  @Post('import-initial-words')
  @HttpCode(200)
  async importInitialWords(@Body() body: { words: { word: string; meanings: string[] }[] }) {
    const { words } = body;
    if (!words || !Array.isArray(words) || words.length === 0) {
      return { code: 400, msg: '单词列表不能为空', data: null };
    }
    const existingWords = new Set(newWordBank.map(w => w.word.toLowerCase()));
    const newEntries: WordEntry[] = [];
    for (const w of words) {
      if (!existingWords.has(w.word.toLowerCase())) {
        newEntries.push({ word: w.word, meanings: w.meanings, date: new Date().toISOString().split('T')[0] });
        existingWords.add(w.word.toLowerCase());
      }
    }
    newWordBank = [...newEntries, ...newWordBank];
    console.log('[import-initial-words] imported', newEntries.length, 'words, total:', newWordBank.length);
    return { code: 200, msg: 'success', data: { imported: newEntries.length, total: newWordBank.length } };
  }
}
