import { View, Text } from '@tarojs/components';
import Taro, { useLoad } from '@tarojs/taro';
import { useState, useEffect } from 'react';
import { Network } from '@/network';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Volume2, Check, X, House, Mic, Keyboard, RefreshCcw } from 'lucide-react-taro';
import './index.css';

interface WordItem {
  word: string;
  phonetic: string;
  meanings: string[];
  addedDate: string;
  usPhonetic?: string;
  ukPhonetic?: string;
}

interface DictationResult {
  word: string;
  spellingCorrect: boolean;
  userSpelling: string;
  meaningCorrect: boolean;
  userMeaning: string;
  isCorrect: boolean;
  correctMeaning: string;
  addedToReview: boolean;
}

const DictationPage = () => {
  // 平台检测（同时支持微信和抖音）
  const isMiniApp = [Taro.ENV_TYPE.WEAPP, Taro.ENV_TYPE.TT].includes(Taro.getEnv() as any);

  const [words, setWords] = useState<WordItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  // 阶段: ready -> listening -> spelling -> meaning -> result -> auto_next
  const [phase, setPhase] = useState<'ready' | 'listening' | 'spelling' | 'meaning' | 'result'>('ready');
  const [userSpelling, setUserSpelling] = useState('');
  const [userMeaning, setUserMeaning] = useState('');
  const [spellingCorrect, setSpellingCorrect] = useState<boolean | null>(null);
  const [meaningCorrect, setMeaningCorrect] = useState<boolean | null>(null);
  const [results, setResults] = useState<DictationResult[]>([]);
  const [isChecking, setIsChecking] = useState(false);
  const [dictationType, setDictationType] = useState<'new' | 'review'>('new');
  const [recorderManager, setRecorderManager] = useState<Taro.RecorderManager | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [audioPath, setAudioPath] = useState('');
  const [inputMode, setInputMode] = useState<'voice' | 'text'>('text');

  useLoad(() => {
    console.log('听写页加载');
    const params = Taro.getCurrentInstance().router?.params;
    const type = params?.type || 'new';
    setDictationType(type as 'new' | 'review');
    loadVocabulary(type as 'new' | 'review');
  });

  // 初始化录音管理器（仅小程序端）
  useEffect(() => {
    if (isMiniApp) {
      const manager = Taro.getRecorderManager();
      manager.onStart(() => {
        console.log('录音开始');
        setIsRecording(true);
      });
      manager.onStop((res) => {
        console.log('录音结束，文件路径:', res.tempFilePath);
        setAudioPath(res.tempFilePath);
        setIsRecording(false);
      });
      manager.onError((err) => {
        console.error('录音错误:', err);
        Taro.showToast({ title: '录音失败', icon: 'none' });
        setIsRecording(false);
      });
      setRecorderManager(manager);
    }
  }, [isMiniApp]);

  // 加载词库
  const loadVocabulary = (type: 'new' | 'review') => {
    const storageKey = type === 'new' ? 'newWordsVocabulary' : 'reviewWordsVocabulary';
    const storedWords = Taro.getStorageSync(storageKey);
    console.log('加载词库:', type, storedWords);

    if (storedWords && storedWords.length > 0) {
      setWords(storedWords);
      Taro.setStorageSync('dictationWords', storedWords);
    } else {
      Taro.showToast({ title: type === 'new' ? '没有新单词' : '复习词库为空', icon: 'none' });
      setTimeout(() => {
        Taro.navigateTo({ url: '/pages/index/index' });
      }, 1500);
    }
  };

  // 当前单词
  const currentWord = words[currentIndex] || null;

  // 开始听写（朗读单词 - 美式+英式各一次）
  const handleStartDictation = async () => {
    if (!currentWord) return;

    setPhase('listening');

    try {
      // 调用 TTS 接口朗读单词（美式+英式）
      const res = await Network.request({
        url: '/api/dictation/speak-word-both',
        method: 'POST',
        data: { word: currentWord.word },
      });

      console.log('朗读响应:', res);

      // 如果返回了两个音频 URL，依次播放
      if (res?.data?.usAudioUrl && res?.data?.ukAudioUrl) {
        await playAudioSequence([res.data.usAudioUrl, res.data.ukAudioUrl]);
      } else if (res?.data?.audioUrl) {
        // 单一音频
        await playSingleAudio(res.data.audioUrl);
      } else {
        // 没有音频，使用备用方案
        console.log('无音频URL，进入拼写阶段');
        setPhase('spelling');
      }
    } catch (error) {
      console.error('朗读失败:', error);
      setPhase('spelling');
    }
  };

  // 依次播放多个音频
  const playAudioSequence = async (audioUrls: string[]) => {
    for (const url of audioUrls) {
      await playSingleAudio(url);
    }
    setPhase('spelling');
  };

  // 播放单个音频
  const playSingleAudio = (audioUrl: string): Promise<void> => {
    return new Promise((resolve) => {
      const innerAudioContext = Taro.createInnerAudioContext();
      innerAudioContext.src = audioUrl;
      innerAudioContext.onPlay(() => {
        console.log('开始播放:', audioUrl);
      });
      innerAudioContext.onEnded(() => {
        console.log('播放结束');
        innerAudioContext.destroy();
        resolve();
      });
      innerAudioContext.onError((err) => {
        console.error('播放失败:', err);
        innerAudioContext.destroy();
        resolve(); // 即使失败也继续
      });
      innerAudioContext.play();
    });
  };

  // 检查拼写
  const handleCheckSpelling = async () => {
    if (!userSpelling.trim()) {
      Taro.showToast({ title: '请输入英文拼写', icon: 'none' });
      return;
    }

    setIsChecking(true);

    // 简单的拼写比对（忽略大小写和空格）
    const correctSpelling = currentWord!.word.toLowerCase().replace(/\s+/g, '');
    const userSpellingNormalized = userSpelling.trim().toLowerCase().replace(/\s+/g, '');

    const isSpellingCorrect = correctSpelling === userSpellingNormalized;
    setSpellingCorrect(isSpellingCorrect);

    if (isSpellingCorrect) {
      Taro.showToast({ title: '拼写正确！请说出中文含义', icon: 'success', duration: 1500 });
      setPhase('meaning');
    } else {
      // 拼写错误，直接判定为错误，加入复习词库
      const result: DictationResult = {
        word: currentWord!.word,
        spellingCorrect: false,
        userSpelling: userSpelling.trim(),
        meaningCorrect: false,
        userMeaning: '',
        isCorrect: false,
        correctMeaning: currentWord!.meanings.join('；'),
        addedToReview: dictationType === 'new',
      };
      setResults([...results, result]);

      if (dictationType === 'new') {
        addToReviewVocabulary(currentWord!);
      }

      setPhase('result');
    }

    setIsChecking(false);
  };

  // 开始录音
  const handleStartRecording = () => {
    if (!isMiniApp) {
      Taro.showToast({ title: 'H5端暂不支持语音输入', icon: 'none' });
      setInputMode('text');
      return;
    }

    recorderManager?.start({
      format: 'wav',
      sampleRate: 16000,
      numberOfChannels: 1,
    });
  };

  // 结束录音并识别
  const handleStopRecording = async () => {
    if (!isMiniApp) return;
    recorderManager?.stop();
  };

  // 录音结束后自动识别
  useEffect(() => {
    if (audioPath && phase === 'meaning') {
      recognizeSpeech(audioPath);
    }
  }, [audioPath]);

  // 语音识别
  const recognizeSpeech = async (path: string) => {
    try {
      // 读取音频文件并转 base64
      const fileSystemManager = Taro.getFileSystemManager();
      const arrayBuffer = fileSystemManager.readFileSync(path);
      const base64 = Taro.arrayBufferToBase64(arrayBuffer as ArrayBuffer);

      // 调用 ASR 接口
      const res = await Network.request({
        url: '/api/dictation/asr',
        method: 'POST',
        data: { audioData: base64 },
      });

      console.log('ASR 响应:', res);

      const recognizedText = res?.data?.text || '';
      if (recognizedText) {
        setUserMeaning(recognizedText);
        // 自动检查答案
        handleCheckMeaning(recognizedText);
      } else {
        Taro.showToast({ title: '未识别到内容，请重试', icon: 'none' });
      }
    } catch (error) {
      console.error('语音识别失败:', error);
      Taro.showToast({ title: '识别失败，请手动输入', icon: 'none' });
      setInputMode('text');
    }
    setAudioPath('');
  };

  // 检查中文含义
  const handleCheckMeaning = async (meaning?: string) => {
    const answer = meaning || userMeaning;
    if (!answer.trim()) {
      Taro.showToast({ title: '请输入或说出中文含义', icon: 'none' });
      return;
    }

    setIsChecking(true);

    try {
      const res = await Network.request({
        url: '/api/dictation/check-answer',
        method: 'POST',
        data: {
          word: currentWord!.word,
          correctMeanings: currentWord!.meanings,
          userAnswer: answer.trim(),
        },
      });

      console.log('含义检查响应:', res);

      const correct = res?.data?.isCorrect || false;
      setMeaningCorrect(correct);

      const result: DictationResult = {
        word: currentWord!.word,
        spellingCorrect: true,
        userSpelling: userSpelling.trim(),
        meaningCorrect: correct,
        userMeaning: answer.trim(),
        isCorrect: correct,
        correctMeaning: res?.data?.matchedMeaning || currentWord!.meanings.join('；'),
        addedToReview: !correct && dictationType === 'new',
      };
      setResults([...results, result]);

      // 如果是复习词库且答对了，从复习词库删除
      if (dictationType === 'review' && correct) {
        removeFromReviewVocabulary(currentWord!.word);
      }

      // 如果是新单词词库且答错了，加入复习词库
      if (!correct && dictationType === 'new') {
        addToReviewVocabulary(currentWord!);
      }

      setPhase('result');

      // 如果正确，自动继续下一个
      if (correct) {
        setTimeout(() => {
          moveToNext();
        }, 1000);
      }
    } catch (error) {
      console.error('检查答案失败:', error);
      Taro.showToast({ title: '检查失败，请重试', icon: 'none' });
    } finally {
      setIsChecking(false);
    }
  };

  // 加入复习词库
  const addToReviewVocabulary = (word: WordItem) => {
    const reviewWords = Taro.getStorageSync('reviewWordsVocabulary') || [];
    const exists = reviewWords.some((w: WordItem) => w.word === word.word);
    if (!exists) {
      reviewWords.push({
        ...word,
        addedDate: new Date().toLocaleDateString('zh-CN'),
      });
      Taro.setStorageSync('reviewWordsVocabulary', reviewWords);
      console.log('已加入复习词库:', word.word);
    }
  };

  // 从复习词库删除
  const removeFromReviewVocabulary = (wordText: string) => {
    const reviewWords = Taro.getStorageSync('reviewWordsVocabulary') || [];
    const updatedWords = reviewWords.filter((w: WordItem) => w.word !== wordText);
    Taro.setStorageSync('reviewWordsVocabulary', updatedWords);
    console.log('已从复习词库移除:', wordText);
  };

  // 进入下一个单词
  const moveToNext = () => {
    setUserSpelling('');
    setUserMeaning('');
    setSpellingCorrect(null);
    setMeaningCorrect(null);
    setAudioPath('');

    if (currentIndex < words.length - 1) {
      setCurrentIndex(currentIndex + 1);
      setPhase('ready');
    } else {
      showFinalResults();
    }
  };

  // 显示最终结果
  const showFinalResults = () => {
    const correctCount = results.filter(r => r.isCorrect).length;
    const wrongCount = results.filter(r => !r.isCorrect).length;

    Taro.showModal({
      title: '听写完成',
      content: `正确: ${correctCount} 个\n错误: ${wrongCount} 个\n已加入复习词库: ${results.filter(r => r.addedToReview).length} 个`,
      showCancel: false,
      confirmText: '返回首页',
      success: () => {
        Taro.navigateTo({ url: '/pages/index/index' });
      },
    });
  };

  // 用户说不知道
  const handleUnknown = () => {
    const result: DictationResult = {
      word: currentWord!.word,
      spellingCorrect: false,
      userSpelling: '不知道',
      meaningCorrect: false,
      userMeaning: '不知道',
      isCorrect: false,
      correctMeaning: currentWord!.meanings.join('；'),
      addedToReview: true,
    };
    setResults([...results, result]);

    if (dictationType === 'new') {
      addToReviewVocabulary(currentWord!);
    }

    moveToNext();
  };

  // 返回首页
  const handleBackToHome = () => {
    Taro.navigateTo({ url: '/pages/index/index' });
  };

  // 重新听写当前单词
  const handleRepeatWord = () => {
    setPhase('ready');
    setUserSpelling('');
    setUserMeaning('');
    setSpellingCorrect(null);
    setMeaningCorrect(null);
  };

  // 进度计算
  const progress = ((currentIndex + 1) / words.length) * 100;

  return (
    <View className="min-h-screen bg-white p-4">
      {/* 顶部进度 */}
      <View className="flex items-center justify-between mb-4">
        <Text className="block text-sm text-gray-500">
          {dictationType === 'new' ? '新单词听写' : '复习听写'} - {currentIndex + 1}/{words.length}
        </Text>
        <View className="flex-1 mx-3">
          <View className="h-2 bg-gray-200 rounded-full overflow-hidden">
            <View
              className="h-full bg-blue-500 rounded-full"
              style={{ width: `${progress}%` }}
            />
          </View>
        </View>
        <View onClick={handleBackToHome}>
          <House size={20} color="#6b7280" />
        </View>
      </View>

      {/* 单词卡片 */}
      <Card className="shadow-lg mb-4">
        <CardContent className="p-6">
          {/* 准备阶段 */}
          {phase === 'ready' && (
            <View className="text-center py-8">
              <Text className="block text-lg text-gray-600 mb-4">
                准备听写第 {currentIndex + 1} 个单词
              </Text>
              <Button
                onClick={handleStartDictation}
                className="bg-blue-500 text-white rounded-full px-8 py-3"
              >
                <View className="flex items-center justify-center gap-2">
                  <Volume2 size={20} color="#ffffff" />
                  <Text className="text-white font-semibold">开始听写</Text>
                </View>
              </Button>
            </View>
          )}

          {/* 听力阶段 */}
          {phase === 'listening' && (
            <View className="text-center py-8">
              <Text className="block text-lg text-gray-600 mb-2">
                正在朗读单词...
              </Text>
              <Text className="block text-sm text-gray-400 mb-4">
                （美式发音 + 英式发音）
              </Text>
              <View className="animate-pulse">
                <Volume2 size={48} color="#3b82f6" />
              </View>
              <Text className="block text-sm text-gray-500 mt-4">
                请仔细听，然后在下方输入英文拼写
              </Text>
            </View>
          )}

          {/* 拼写阶段 */}
          {phase === 'spelling' && (
            <View className="py-6">
              <Text className="block text-lg font-semibold text-gray-800 mb-4">
                请输入英文拼写：
              </Text>
              <View className="bg-gray-50 rounded-xl px-4 py-3 mb-4">
                <Input
                  className="w-full bg-transparent"
                  placeholder="输入你听到的单词或短语..."
                  value={userSpelling}
                  onInput={(e) => setUserSpelling(e.detail.value)}
                />
              </View>
              <View className="flex gap-3">
                <Button
                  onClick={handleCheckSpelling}
                  disabled={isChecking}
                  className="flex-1 bg-blue-500 text-white rounded-lg"
                >
                  <Text className="text-white">{isChecking ? '检查中...' : '确认拼写'}</Text>
                </Button>
                <Button
                  onClick={handleStartDictation}
                  className="flex-shrink-0 bg-gray-100 rounded-lg"
                >
                  <RefreshCcw size={18} color="#6b7280" />
                </Button>
              </View>
              <Button
                onClick={handleUnknown}
                className="w-full mt-3 bg-gray-200 text-gray-600 rounded-lg"
              >
                <Text className="text-gray-600">不知道</Text>
              </Button>
            </View>
          )}

          {/* 含义阶段 */}
          {phase === 'meaning' && (
            <View className="py-6">
              <View className="text-center mb-4">
                <Text className="block text-lg font-semibold text-green-600">
                  拼写正确！
                </Text>
                <Text className="block text-sm text-gray-500">
                  单词: {currentWord?.word}
                </Text>
              </View>
              <Text className="block text-lg font-semibold text-gray-800 mb-4">
                请说出或输入中文含义：
              </Text>

              {/* 输入模式切换 */}
              <View className="flex gap-2 mb-4">
                <Button
                  onClick={() => setInputMode('voice')}
                  className={`flex-1 rounded-lg ${inputMode === 'voice' ? 'bg-blue-500' : 'bg-gray-100'}`}
                >
                  <View className="flex items-center justify-center gap-2">
                    <Mic size={18} color={inputMode === 'voice' ? '#ffffff' : '#6b7280'} />
                    <Text className={inputMode === 'voice' ? 'text-white' : 'text-gray-600'}>语音输入</Text>
                  </View>
                </Button>
                <Button
                  onClick={() => setInputMode('text')}
                  className={`flex-1 rounded-lg ${inputMode === 'text' ? 'bg-blue-500' : 'bg-gray-100'}`}
                >
                  <View className="flex items-center justify-center gap-2">
                    <Keyboard size={18} color={inputMode === 'text' ? '#ffffff' : '#6b7280'} />
                    <Text className={inputMode === 'text' ? 'text-white' : 'text-gray-600'}>手动输入</Text>
                  </View>
                </Button>
              </View>

              {/* 语音输入 */}
              {inputMode === 'voice' && (
                <View className="text-center py-4">
                  {isMiniApp ? (
                    <>
                      <Button
                        onClick={isRecording ? handleStopRecording : handleStartRecording}
                        className={`rounded-full px-8 py-4 ${isRecording ? 'bg-red-500' : 'bg-blue-500'}`}
                      >
                        <Mic size={32} color="#ffffff" />
                      </Button>
                      <Text className="block text-sm text-gray-500 mt-2">
                        {isRecording ? '正在录音，点击停止' : '点击开始录音'}
                      </Text>
                    </>
                  ) : (
                    <Text className="block text-gray-500">
                      语音输入仅在小程序中可用{'\n'}请使用手动输入
                    </Text>
                  )}
                </View>
              )}

              {/* 手动输入 */}
              {inputMode === 'text' && (
                <View>
                  <View className="bg-gray-50 rounded-xl px-4 py-3 mb-4">
                    <Input
                      className="w-full bg-transparent"
                      placeholder="输入中文含义..."
                      value={userMeaning}
                      onInput={(e) => setUserMeaning(e.detail.value)}
                    />
                  </View>
                  <Button
                    onClick={() => handleCheckMeaning()}
                    disabled={isChecking}
                    className="w-full bg-green-500 text-white rounded-lg"
                  >
                    <Text className="text-white">{isChecking ? '检查中...' : '确认含义'}</Text>
                  </Button>
                </View>
              )}

              <Button
                onClick={handleUnknown}
                className="w-full mt-3 bg-gray-200 text-gray-600 rounded-lg"
              >
                <Text className="text-gray-600">不知道</Text>
              </Button>
            </View>
          )}

          {/* 结果阶段 */}
          {phase === 'result' && (
            <View className="py-6">
              <View className="text-center mb-4">
                {spellingCorrect ? (
                  meaningCorrect ? (
                    <View className="flex items-center justify-center gap-2">
                      <Check size={32} color="#22c55e" />
                      <Text className="block text-lg font-semibold text-green-600">完全正确！</Text>
                    </View>
                  ) : (
                    <View className="flex items-center justify-center gap-2">
                      <X size={32} color="#ef4444" />
                      <Text className="block text-lg font-semibold text-red-600">含义错误</Text>
                    </View>
                  )
                ) : (
                  <View className="flex items-center justify-center gap-2">
                    <X size={32} color="#ef4444" />
                    <Text className="block text-lg font-semibold text-red-600">拼写错误</Text>
                  </View>
                )}
              </View>

              <View className="bg-gray-50 rounded-lg p-4 mb-4">
                <Text className="block text-sm text-gray-500 mb-2">正确答案：</Text>
                <Text className="block text-lg font-semibold text-gray-800">
                  {currentWord?.word}
                </Text>
                {currentWord?.phonetic && (
                  <Text className="block text-sm text-gray-600">
                    音标: {currentWord.phonetic}
                  </Text>
                )}
                <Text className="block text-sm text-gray-600">
                  含义: {currentWord?.meanings?.join('；')}
                </Text>
              </View>

              <View className="bg-blue-50 rounded-lg p-4 mb-4">
                <Text className="block text-sm text-gray-500 mb-2">你的答案：</Text>
                <Text className="block text-base text-gray-800">
                  拼写: {userSpelling || '不知道'}
                  {spellingCorrect ? ' ✓' : ' ✗'}
                </Text>
                <Text className="block text-base text-gray-800">
                  含义: {userMeaning || '未作答'}
                  {meaningCorrect === null ? '' : meaningCorrect ? ' ✓' : ' ✗'}
                </Text>
              </View>

              {meaningCorrect && (
                <Text className="block text-sm text-green-600 text-center mb-4">
                  自动进入下一个单词...
                </Text>
              )}

              <View className="flex gap-3">
                <Button
                  onClick={handleRepeatWord}
                  className="flex-1 bg-gray-100 rounded-lg"
                >
                  <RefreshCcw size={18} color="#6b7280" />
                  <Text className="text-gray-600 ml-2">重新听写</Text>
                </Button>
                <Button
                  onClick={moveToNext}
                  className="flex-1 bg-blue-500 text-white rounded-lg"
                >
                  <Text className="text-white">下一个</Text>
                </Button>
              </View>
            </View>
          )}
        </CardContent>
      </Card>

      {/* 结果统计 */}
      {results.length > 0 && (
        <Card className="mt-4">
          <CardContent className="p-4">
            <Text className="block text-sm text-gray-500 mb-2">
              已完成: {results.length}/{words.length}
            </Text>
            <View className="flex gap-4">
              <View className="flex items-center gap-1">
                <Check size={16} color="#22c55e" />
                <Text className="block text-sm text-green-600">
                  {results.filter(r => r.isCorrect).length}
                </Text>
              </View>
              <View className="flex items-center gap-1">
                <X size={16} color="#ef4444" />
                <Text className="block text-sm text-red-600">
                  {results.filter(r => !r.isCorrect).length}
                </Text>
              </View>
            </View>
          </CardContent>
        </Card>
      )}
    </View>
  );
};

export default DictationPage;