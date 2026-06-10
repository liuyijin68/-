import { Controller, Post, Body, UploadedFile, UseInterceptors, HttpCode } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { S3Storage, Config } from 'coze-coding-dev-sdk';
import { LLMClient, TTSClient } from 'coze-coding-dev-sdk';
import type { Request } from 'express';

interface SelectionRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface WordItem {
  word: string;
  phonetic: string;
  meaning: string;
}

interface WordItemNew {
  word: string;
  phonetic: string;
  meanings: string[];
  addedDate: string;
}

@Controller('dictation')
export class DictationController {
  private storage: S3Storage;
  private llmConfig: Config;

  constructor() {
    this.storage = new S3Storage({
      endpointUrl: process.env.COZE_BUCKET_ENDPOINT_URL,
      accessKey: '',
      secretKey: '',
      bucketName: process.env.COZE_BUCKET_NAME,
      region: 'cn-beijing',
    });
    this.llmConfig = new Config();
  }

  /**
   * 上传图片到对象存储
   */
  @Post('upload-image')
  @HttpCode(200)
  @UseInterceptors(FileInterceptor('image'))
  async uploadImage(@UploadedFile() file: Express.Multer.File) {
    console.log('上传图片:', file.originalname, file.mimetype);

    let fileContent: Buffer;
    if (file.path) {
      // 小程序端
      const fs = await import('fs');
      fileContent = fs.readFileSync(file.path);
    } else if (file.buffer) {
      // H5 端
      fileContent = file.buffer;
    } else {
      throw new Error('无法获取文件内容');
    }

    // 上传到对象存储
    const fileKey = await this.storage.uploadFile({
      fileContent,
      fileName: `dictation/${Date.now()}_${file.originalname}`,
      contentType: file.mimetype,
    });

    // 获取公开访问 URL
    const imageUrl = await this.storage.generatePresignedUrl({
      key: fileKey,
      expireTime: 3600, // 1小时有效
    });

    console.log('图片上传成功:', imageUrl);

    return {
      code: 200,
      msg: 'success',
      data: {
        fileKey,
        imageUrl,
      },
    };
  }

  /**
   * 使用 LLM 多模态识别图片中圈选区域的单词
   */
  @Post('recognize-words')
  @HttpCode(200)
  async recognizeWords(@Body() body: { imageUrl: string; selections: SelectionRect[] }) {
    const { imageUrl, selections } = body;

    console.log('识别单词:', imageUrl, selections);

    if (!imageUrl || !selections || selections.length === 0) {
      return {
        code: 400,
        msg: '缺少必要参数',
        data: null,
      };
    }

    // 使用多模态 LLM 识别图片中的单词
    const client = new LLMClient(this.llmConfig);

    const prompt = `请分析这张英语单词学习图片。
图片中有一些英语单词，每个单词通常包含：
- 英语单词本身
- 音标（如 /ˈwɜːrd/ 格式）
- 中文含义

用户圈选了以下区域来指定要听写的单词（坐标为相对图片的位置）：
${selections.map((s, i) => `区域${i + 1}: x=${s.x}, y=${s.y}, width=${s.width}, height=${s.height}`).join('\n')}

请根据这些区域，识别出每个区域对应的单词信息。
返回格式为 JSON 数组，每个元素包含：
- word: 英语单词
- phonetic: 音标
- meaning: 中文含义

只返回 JSON 数组，不要其他解释文字。
示例输出格式：
[{"word":"apple","phonetic":"/ˈæpl/","meaning":"苹果"},{"word":"banana","phonetic":"/bəˈnɑːnə/","meaning":"香蕉"}]`;

    const messages = [
      {
        role: 'user' as const,
        content: [
          { type: 'text' as const, text: prompt },
          {
            type: 'image_url' as const,
            image_url: {
              url: imageUrl,
              detail: 'high' as const,
            },
          },
        ],
      },
    ];

    try {
      const response = await client.invoke(messages, {
        model: 'doubao-seed-1-8-251228',
        temperature: 0.3,
      });

      console.log('LLM 响应:', response.content);

      // 解析 JSON 结果
      let words: WordItem[] = [];
      try {
        // 提取 JSON 数组部分
        const content = response.content.trim();
        const jsonMatch = content.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          words = JSON.parse(jsonMatch[0]);
        }
      } catch (parseErr) {
        console.error('JSON 解析失败:', parseErr);
        // 返回空数组
        words = [];
      }

      return {
        code: 200,
        msg: 'success',
        data: {
          words,
        },
      };
    } catch (err) {
      console.error('LLM 调用失败:', err);
      return {
        code: 500,
        msg: '识别失败',
        data: null,
      };
    }
  }

  /**
   * TTS 语音合成 - 念出单词
   */
  @Post('speak-word')
  @HttpCode(200)
  async speakWord(@Body() body: { word: string }) {
    const { word } = body;

    console.log('语音合成:', word);

    if (!word) {
      return {
        code: 400,
        msg: '缺少单词参数',
        data: null,
      };
    }

    const client = new TTSClient(this.llmConfig);

    try {
      // 使用英语发音的语音
      const response = await client.synthesize({
        uid: 'dictation-user',
        text: word,
        speaker: 'zh_female_vv_uranus_bigtts', // 支持中英文的语音
        audioFormat: 'mp3',
        sampleRate: 24000,
      });

      console.log('TTS 响应:', response.audioUri);

      return {
        code: 200,
        msg: 'success',
        data: {
          audioUrl: response.audioUri,
        },
      };
    } catch (err) {
      console.error('TTS 调用失败:', err);
      return {
        code: 500,
        msg: '语音合成失败',
        data: null,
      };
    }
  }

  /**
   * 使用 LLM 多模态识别图片中所有单词（不圈选）
   * 只识别英文单词/短语，中文含义通过翻译获取
   */
  @Post('recognize-all-words')
  @HttpCode(200)
  async recognizeAllWords(@Body() body: { imageUrl: string }) {
    const { imageUrl } = body;

    console.log('识别全部单词:', imageUrl);

    if (!imageUrl) {
      return {
        code: 400,
        msg: '缺少图片URL',
        data: null,
      };
    }

    // 使用多模态 LLM 识别图片中的单词
    const client = new LLMClient(this.llmConfig);

    // 第一步：识别图片中所有英文单词/短语
    const recognizePrompt = `请分析这张英语单词学习图片。

这张图片是典型的单词学习卡片格式，格式规则如下：
- 单词后面有斜杠 "/" 表示后面是音标，音标后面是词性和中文含义
- 短语后面没有音标和词性，只有中文含义
- 每行可能包含一个单词或短语及其相关信息

请识别图片中所有的英文单词或短语（不识别中文含义）。

返回格式为 JSON 数组，每个元素包含：
- word: 英语单词或短语
- phonetic: 音标（如果有，没有则为空字符串）
- rawMeaning: 图片中显示的原始中文含义行（用于后续翻译参考）

只返回 JSON 数组，不要其他解释文字。
示例输出格式：
[{"word":"apple","phonetic":"/ˈæpl/","rawMeaning":"n. 苹果"},{"word":"look forward to","phonetic":"","rawMeaning":"期待；盼望"}]`;

    const recognizeMessages = [
      {
        role: 'user' as const,
        content: [
          { type: 'text' as const, text: recognizePrompt },
          {
            type: 'image_url' as const,
            image_url: {
              url: imageUrl,
              detail: 'high' as const,
            },
          },
        ],
      },
    ];

    try {
      const recognizeResponse = await client.invoke(recognizeMessages, {
        model: 'doubao-seed-1-8-251228',
        temperature: 0.3,
      });

      console.log('识别响应:', recognizeResponse.content);

      // 解析识别结果
      let rawWords: { word: string; phonetic: string; rawMeaning: string }[] = [];
      try {
        const content = recognizeResponse.content.trim();
        const jsonMatch = content.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          rawWords = JSON.parse(jsonMatch[0]);
        }
      } catch (parseErr) {
        console.error('JSON 解析失败:', parseErr);
        return {
          code: 500,
          msg: '识别结果解析失败',
          data: null,
        };
      }

      if (rawWords.length === 0) {
        return {
          code: 200,
          msg: '未识别到单词',
          data: { words: [] },
        };
      }

      // 第二步：为每个单词翻译获取完整中文含义（多词性多含义）
      const words: WordItemNew[] = [];
      for (const rawWord of rawWords) {
        const translatedMeanings = await this.translateWord(client, rawWord.word, rawWord.rawMeaning);
        words.push({
          word: rawWord.word,
          phonetic: rawWord.phonetic,
          meanings: translatedMeanings,
          addedDate: new Date().toLocaleDateString('zh-CN'),
        });
      }

      console.log('最终识别结果:', words);

      return {
        code: 200,
        msg: 'success',
        data: {
          words,
          count: words.length,
        },
      };
    } catch (err) {
      console.error('识别失败:', err);
      return {
        code: 500,
        msg: '识别失败',
        data: null,
      };
    }
  }

  /**
   * 翻译单词获取完整中文含义（多词性多含义）
   */
  private async translateWord(client: LLMClient, word: string, rawMeaning: string): Promise<string[]> {
    const translatePrompt = `请为以下英语单词或短语提供完整的中文翻译，包括所有词性和含义。

单词: ${word}
图片中的原始含义参考: ${rawMeaning}

要求：
1. 如果单词有多种词性（如名词、动词、形容词等），每种词性的含义都要列出
2. 如果某个词性有多种含义，都要列出
3. 用户只需说对其中一个含义就判定为正确

返回格式为 JSON 数组，包含所有可能的含义：
["含义1","含义2","含义3"]

示例：
单词 "run" 应返回：
["跑；奔跑","运营；管理","运行；运转","n. 跑步；运行"]

单词 "look forward to" 应返回：
["期待；盼望","盼望；期望"]

只返回 JSON 数组，不要其他解释文字。`;

    const translateMessages = [
      {
        role: 'user' as const,
        content: translatePrompt,
      },
    ];

    try {
      const translateResponse = await client.invoke(translateMessages, {
        model: 'doubao-seed-1-8-251228',
        temperature: 0.3,
      });

      console.log('翻译响应:', word, translateResponse.content);

      // 解析翻译结果
      try {
        const content = translateResponse.content.trim();
        const jsonMatch = content.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          return JSON.parse(jsonMatch[0]);
        }
      } catch (parseErr) {
        console.error('翻译 JSON 解析失败:', parseErr);
      }

      // 降级处理：使用原始含义
      if (rawMeaning) {
        return [rawMeaning];
      }
      return [`请参考词典查询 ${word} 的含义`];
    } catch (err) {
      console.error('翻译失败:', word, err);
      if (rawMeaning) {
        return [rawMeaning];
      }
      return [`请参考词典查询 ${word} 的含义`];
    }
  }

  /**
   * 使用 LLM 检查答案是否正确（支持多词性多含义）
   */
  @Post('check-answer')
  @HttpCode(200)
  async checkAnswerNew(@Body() body: { word: string; correctMeanings: string[]; userAnswer: string }) {
    const { word, correctMeanings, userAnswer } = body;

    console.log('检查答案:', word, correctMeanings, userAnswer);

    if (!word || !correctMeanings || correctMeanings.length === 0 || !userAnswer) {
      return {
        code: 400,
        msg: '缺少必要参数',
        data: null,
      };
    }

    const client = new LLMClient(this.llmConfig);

    const prompt = `请判断用户的答案是否正确。

单词: ${word}
所有可能的正确含义（用户只需说对其中一个）:
${correctMeanings.map((m, i) => `${i + 1}. ${m}`).join('\n')}
用户答案: ${userAnswer}

判断规则：
1. 用户答案只需匹配其中一个含义即算正确
2. 如果用户答案与某个含义语义相近，算正确
3. 如果用户答案包含了某个正确含义的核心意思，算正确
4. 如果用户答案完全错误或与所有正确含义无关，算错误

只返回一个 JSON 对象：
{"isCorrect": true, "matchedMeaning": "匹配的含义"} 或 {"isCorrect": false, "matchedMeaning": ""}`;

    const messages = [
      {
        role: 'user' as const,
        content: prompt,
      },
    ];

    try {
      const response = await client.invoke(messages, {
        model: 'doubao-seed-1-8-251228',
        temperature: 0.1,
      });

      console.log('LLM 响应:', response.content);

      // 解析结果
      let isCorrect = false;
      let matchedMeaning = '';
      try {
        const content = response.content.trim();
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          isCorrect = parsed.isCorrect === true;
          matchedMeaning = parsed.matchedMeaning || '';
        }
      } catch (parseErr) {
        console.error('JSON 解析失败:', parseErr);
        // 降级处理：检查是否有任何含义匹配
        for (const meaning of correctMeanings) {
          if (userAnswer.toLowerCase().includes(meaning.toLowerCase()) ||
              meaning.toLowerCase().includes(userAnswer.toLowerCase())) {
            isCorrect = true;
            matchedMeaning = meaning;
            break;
          }
        }
      }

      return {
        code: 200,
        msg: 'success',
        data: {
          isCorrect,
          word,
          matchedMeaning,
          correctMeanings,
          userAnswer,
        },
      };
    } catch (err) {
      console.error('LLM 调用失败:', err);
      // 降级处理
      let isCorrect = false;
      let matchedMeaning = '';
      for (const meaning of correctMeanings) {
        if (userAnswer.toLowerCase().includes(meaning.toLowerCase()) ||
            meaning.toLowerCase().includes(userAnswer.toLowerCase())) {
          isCorrect = true;
          matchedMeaning = meaning;
          break;
        }
      }
      
      return {
        code: 200,
        msg: 'success (fallback)',
        data: {
          isCorrect,
          word,
          matchedMeaning,
          correctMeanings,
          userAnswer,
        },
      };
    }
  }
}