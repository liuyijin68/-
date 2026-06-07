import { View, Text } from '@tarojs/components';
import Taro, { useLoad } from '@tarojs/taro';
import { useState } from 'react';
import { Network } from '@/network';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Volume2, Check, X, SkipForward, RotateCcw, House } from 'lucide-react-taro';
import './index.css';

interface WordItem {
  word: string;
  phonetic: string;
  meaning: string;
}

interface DictationResult {
  word: string;
  userAnswer: string;
  isCorrect: boolean;
  correctMeaning: string;
}

const DictationPage = () => {
  const [words, setWords] = useState<WordItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [phase, setPhase] = useState<'ready' | 'listening' | 'answering' | 'result'>('ready');
  const [userAnswer, setUserAnswer] = useState('');
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [results, setResults] = useState<DictationResult[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isChecking, setIsChecking] = useState(false);

  useLoad(() => {
    // 从存储中获取单词列表
    const storedWords = Taro.getStorageSync('dictationWords');
    if (storedWords && storedWords.length > 0) {
      setWords(storedWords);
    } else {
      Taro.showToast({ title: '没有单词数据', icon: 'none' });
      setTimeout(() => {
        Taro.navigateBack();
      }, 1500);
    }
  });

  // 当前单词
  const currentWord = words[currentIndex] || null;

  // 进度百分比
  const progressPercent = words.length > 0 
    ? Math.round(((currentIndex + (phase === 'result' ? 1 : 0)) / words.length) * 100) 
    : 0;

  // 正确数量
  const correctCount = results.filter(r => r.isCorrect).length;

  // 播放单词读音
  const handleSpeak = async () => {
    if (!currentWord || isPlaying) return;

    setIsPlaying(true);

    try {
      const res = await Network.request({
        url: '/api/dictation/speak-word',
        method: 'POST',
        data: {
          word: currentWord.word
        }
      });

      console.log('语音响应:', res.data);
      const data = res.data as any;
      
      if (data?.data?.audioUrl) {
        // 播放音频
        const innerAudioContext = Taro.createInnerAudioContext();
        innerAudioContext.src = data.data.audioUrl;
        innerAudioContext.onEnded(() => {
          setIsPlaying(false);
          innerAudioContext.destroy();
        });
        innerAudioContext.onError((err) => {
          console.error('音频播放错误:', err);
          setIsPlaying(false);
          innerAudioContext.destroy();
          Taro.showToast({ title: '播放失败', icon: 'none' });
        });
        innerAudioContext.play();
      }
    } catch (err) {
      console.error('获取语音失败:', err);
      setIsPlaying(false);
      Taro.showToast({ title: '获取语音失败', icon: 'none' });
    }
  };

  // 开始听写
  const handleStartDictation = () => {
    setPhase('listening');
    handleSpeak();
  };

  // 写完了，准备说答案
  const handleWritten = () => {
    setPhase('answering');
  };

  // 再次播放单词
  const handleReplay = () => {
    handleSpeak();
  };

  // 提交答案
  const handleSubmitAnswer = async () => {
    if (!userAnswer.trim() || !currentWord) {
      Taro.showToast({ title: '请输入中文含义', icon: 'none' });
      return;
    }

    setIsChecking(true);

    try {
      const res = await Network.request({
        url: '/api/dictation/check-answer',
        method: 'POST',
        data: {
          word: currentWord.word,
          correctMeaning: currentWord.meaning,
          userAnswer: userAnswer.trim()
        }
      });

      console.log('答案检查响应:', res.data);
      const data = res.data as any;
      
      const resultIsCorrect = data?.data?.isCorrect ?? false;
      setIsCorrect(resultIsCorrect);

      // 保存结果
      setResults(prev => [...prev, {
        word: currentWord.word,
        userAnswer: userAnswer.trim(),
        isCorrect: resultIsCorrect,
        correctMeaning: currentWord.meaning
      }]);

      setPhase('result');
    } catch (err) {
      console.error('答案检查失败:', err);
      Taro.showToast({ title: '检查失败，请重试', icon: 'none' });
    } finally {
      setIsChecking(false);
    }
  };

  // 下一个单词
  const handleNextWord = () => {
    if (currentIndex < words.length - 1) {
      setCurrentIndex(prev => prev + 1);
      setUserAnswer('');
      setIsCorrect(null);
      setPhase('listening');
      // 自动播放下一个单词
      setTimeout(() => handleSpeak(), 300);
    } else {
      // 听写完成
      setPhase('ready');
      Taro.showToast({ 
        title: `听写完成！正确 ${correctCount}/${words.length}`, 
        icon: 'success',
        duration: 2000
      });
    }
  };

  // 跳过当前单词
  const handleSkip = () => {
    setResults(prev => [...prev, {
      word: currentWord?.word || '',
      userAnswer: '(跳过)',
      isCorrect: false,
      correctMeaning: currentWord?.meaning || ''
    }]);
    handleNextWord();
  };

  // 重新听写
  const handleRestart = () => {
    setCurrentIndex(0);
    setUserAnswer('');
    setIsCorrect(null);
    setResults([]);
    setPhase('ready');
  };

  // 返回首页
  const handleGoHome = () => {
    Taro.navigateBack();
  };

  // 显示单词信息（仅在结果阶段）
  const showWordInfo = phase === 'result';

  return (
    <View className="min-h-full bg-gray-50 p-4">
      {/* 标题 */}
      <View className="mb-4">
        <Text className="block text-xl font-bold text-gray-800 text-center">单词听写</Text>
        <Text className="block text-sm text-gray-500 text-center mt-1">
          进度: {currentIndex + 1} / {words.length}
        </Text>
      </View>

      {/* 进度条 */}
      <Progress value={progressPercent} className="mb-4" />

      {/* 听写完成统计 */}
      {phase === 'ready' && results.length === words.length && words.length > 0 && (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle>听写完成</CardTitle>
          </CardHeader>
          <CardContent>
            <View className="flex flex-col items-center gap-4">
              <View className="flex flex-row items-center gap-2">
                <Check size={32} color="#10b981" />
                <Text className="block text-2xl font-bold text-emerald-500">
                  {correctCount} / {words.length}
                </Text>
              </View>
              <Text className="block text-gray-500">
                正确率: {Math.round((correctCount / words.length) * 100)}%
              </Text>
              
              {/* 结果详情 */}
              <View className="w-full flex flex-col gap-2 mt-4">
                {results.map((result, index) => (
                  <View 
                    key={index}
                    className={`flex flex-row items-center justify-between p-3 rounded-lg ${
                      result.isCorrect ? 'bg-emerald-50' : 'bg-red-50'
                    }`}
                  >
                    <View className="flex flex-row items-center gap-2">
                      {result.isCorrect ? (
                        <Check size={18} color="#10b981" />
                      ) : (
                        <X size={18} color="#ef4444" />
                      )}
                      <Text className="block font-semibold text-gray-800">{result.word}</Text>
                    </View>
                    <View className="flex flex-col items-end">
                      <Text className={`block text-sm ${result.isCorrect ? 'text-emerald-600' : 'text-red-600'}`}>
                        {result.userAnswer}
                      </Text>
                      {!result.isCorrect && (
                        <Text className="block text-xs text-gray-500">
                          正确: {result.correctMeaning}
                        </Text>
                      )}
                    </View>
                  </View>
                ))}
              </View>

              <View className="flex flex-row gap-2 w-full mt-4">
                <Button className="flex-1" variant="outline" onClick={handleGoHome}>
                  <House size={18} color="#1890ff" className="mr-2" />
                  <Text>返回首页</Text>
                </Button>
                <Button className="flex-1" onClick={handleRestart}>
                  <RotateCcw size={18} color="#1890ff" className="mr-2" />
                  <Text>重新听写</Text>
                </Button>
              </View>
            </View>
          </CardContent>
        </Card>
      )}

      {/* 准备阶段 */}
      {phase === 'ready' && results.length < words.length && (
        <Card className="mb-4">
          <CardContent className="p-6">
            <View className="flex flex-col items-center gap-4">
              <Text className="block text-lg text-gray-700">准备好了吗？</Text>
              <Button className="w-full" onClick={handleStartDictation}>
                <Volume2 size={18} color="#1890ff" className="mr-2" />
                <Text>开始听写</Text>
              </Button>
            </View>
          </CardContent>
        </Card>
      )}

      {/* 听写阶段 - 播放单词 */}
      {phase === 'listening' && currentWord && (
        <Card className="mb-4">
          <CardContent className="p-6">
            <View className="flex flex-col items-center gap-4">
              <Text className="block text-lg text-gray-700">
                正在播放单词...
              </Text>
              {isPlaying && (
                <View className="flex flex-row items-center gap-2">
                  <Volume2 size={32} color="#1890ff" className="animate-pulse" />
                  <Text className="block text-blue-500">播放中</Text>
                </View>
              )}
              <View className="flex flex-row gap-2 w-full mt-4">
                <Button 
                  className="flex-1" 
                  variant="outline"
                  onClick={handleReplay}
                  disabled={isPlaying}
                >
                  <Volume2 size={18} color="#1890ff" className="mr-2" />
                  <Text>再听一次</Text>
                </Button>
                <Button 
                  className="flex-1"
                  onClick={handleWritten}
                >
                  <Check size={18} color="#1890ff" className="mr-2" />
                  <Text>我写完了</Text>
                </Button>
              </View>
            </View>
          </CardContent>
        </Card>
      )}

      {/* 回答阶段 */}
      {phase === 'answering' && currentWord && (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle>说出中文含义</CardTitle>
          </CardHeader>
          <CardContent>
            <View className="flex flex-col gap-4">
              <View className="bg-gray-100 rounded-lg p-3">
                <Input
                  className="w-full bg-transparent"
                  placeholder="输入单词的中文含义..."
                  value={userAnswer}
                  onInput={(e) => setUserAnswer(e.detail.value)}
                />
              </View>
              
              <View className="flex flex-row gap-2">
                <Button 
                  className="flex-1"
                  variant="outline"
                  onClick={handleReplay}
                >
                  <Volume2 size={18} color="#1890ff" className="mr-2" />
                  <Text>再听一次</Text>
                </Button>
                <Button 
                  className="flex-1"
                  onClick={handleSubmitAnswer}
                  disabled={isChecking || !userAnswer.trim()}
                >
                  {isChecking ? (
                    <Text>检查中...</Text>
                  ) : (
                    <>
                      <Check size={18} color="#1890ff" className="mr-2" />
                      <Text>提交答案</Text>
                    </>
                  )}
                </Button>
              </View>
            </View>
          </CardContent>
        </Card>
      )}

      {/* 结果阶段 */}
      {phase === 'result' && currentWord && (
        <Card className="mb-4">
          <CardContent className="p-6">
            <View className="flex flex-col items-center gap-4">
              {/* 结果指示 */}
              <View
                className={`flex flex-row items-center gap-2 p-4 rounded-full ${
                  isCorrect ? 'bg-emerald-100' : 'bg-red-100'
                }`}
              >
                {isCorrect ? (
                  <Check size={32} color="#10b981" />
                ) : (
                  <X size={32} color="#ef4444" />
                )}
                <Text
                  className={`block font-semibold ${
                    isCorrect ? 'text-emerald-600' : 'text-red-600'
                  }`}
                >
                  {isCorrect ? '正确！' : '错误'}
                </Text>
              </View>

              {/* 单词信息 */}
              {showWordInfo && (
                <View className="w-full bg-white rounded-lg p-4 shadow-sm">
                  <View className="flex flex-col items-center gap-2">
                    <Text className="block text-xl font-bold text-gray-800">{currentWord.word}</Text>
                    <Text className="block text-sm text-gray-500">{currentWord.phonetic}</Text>
                    <Text className="block text-base text-gray-700">{currentWord.meaning}</Text>
                  </View>
                  
                  {!isCorrect && (
                    <View className="mt-4 p-3 bg-red-50 rounded-lg">
                      <Text className="block text-sm text-red-600">
                        你的答案: {userAnswer}
                      </Text>
                    </View>
                  )}
                </View>
              )}

              {/* 下一步按钮 */}
              <View className="flex flex-row gap-2 w-full mt-4">
                <Button 
                  className="flex-1"
                  variant="outline"
                  onClick={handleSkip}
                >
                  <SkipForward size={18} color="#1890ff" className="mr-2" />
                  <Text>跳过</Text>
                </Button>
                <Button 
                  className="flex-1"
                  onClick={handleNextWord}
                >
                  <Text>下一个单词</Text>
                </Button>
              </View>
            </View>
          </CardContent>
        </Card>
      )}
    </View>
  );
};

export default DictationPage;