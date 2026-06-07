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
   * 使用 LLM 检查答案是否正确
   */
  @Post('check-answer')
  @HttpCode(200)
  async checkAnswer(@Body() body: { word: string; correctMeaning: string; userAnswer: string }) {
    const { word, correctMeaning, userAnswer } = body;

    console.log('检查答案:', word, correctMeaning, userAnswer);

    if (!word || !correctMeaning || !userAnswer) {
      return {
        code: 400,
        msg: '缺少必要参数',
        data: null,
      };
    }

    const client = new LLMClient(this.llmConfig);

    const prompt = `请判断用户的答案是否正确。

单词: ${word}
正确含义: ${correctMeaning}
用户答案: ${userAnswer}

判断规则：
1. 用户答案需要与正确含义语义相近即可算正确
2. 如果用户答案包含了正确含义的核心意思，算正确
3. 答案顺序不同也算正确
4. 如果用户答案完全错误或与正确含义无关，算错误

只返回一个 JSON 对象：
{"isCorrect": true} 或 {"isCorrect": false}`;

    const messages = [
      {
        role: 'user' as const,
        content: prompt,
      },
    ];

    try {
      const response = await client.invoke(messages, {
        model: 'doubao-seed-1-8-251228',
        temperature: 0.1, // 低温度保证判断一致性
      });

      console.log('LLM 响应:', response.content);

      // 解析结果
      let isCorrect = false;
      try {
        const content = response.content.trim();
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          isCorrect = parsed.isCorrect === true;
        }
      } catch (parseErr) {
        console.error('JSON 解析失败:', parseErr);
        // 默认使用简单的字符串匹配
        isCorrect = userAnswer.toLowerCase().includes(correctMeaning.toLowerCase()) ||
                    correctMeaning.toLowerCase().includes(userAnswer.toLowerCase());
      }

      return {
        code: 200,
        msg: 'success',
        data: {
          isCorrect,
          word,
          correctMeaning,
          userAnswer,
        },
      };
    } catch (err) {
      console.error('LLM 调用失败:', err);
      // 降级处理：简单字符串匹配
      const isCorrect = userAnswer.toLowerCase().includes(correctMeaning.toLowerCase()) ||
                        correctMeaning.toLowerCase().includes(userAnswer.toLowerCase());
      
      return {
        code: 200,
        msg: 'success (fallback)',
        data: {
          isCorrect,
          word,
          correctMeaning,
          userAnswer,
        },
      };
    }
  }
}