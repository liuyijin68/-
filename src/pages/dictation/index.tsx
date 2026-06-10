import { View, Text } from '@tarojs/components';
import Taro, { useLoad } from '@tarojs/taro';
import { useState } from 'react';
import { Network } from '@/network';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Volume2, Check, X, SkipForward, RotateCcw, House, CircleQuestionMark } from 'lucide-react-taro';
import './index.css';

interface WordItem {
  word: string;
  phonetic: string;
  meanings: string[];
  addedDate: string;
}

interface DictationResult {
  word: string;
  userAnswer: string;
  isCorrect: boolean;
  correctMeaning: string;
  addedToReview: boolean;
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
  const [dictationType, setDictationType] = useState<'new' | 'review'>('new');

  useLoad(() => {
    // 获取词库类型参数
    const params = Taro.getCurrentInstance().router?.params;
    const type = params?.type || 'new';
    setDictationType(type as 'new' | 'review');

    // 加载对应词库
    loadVocabulary(type as 'new' | 'review');
  });

  // 加载词库
  const loadVocabulary = (type: 'new' | 'review') => {
    const storageKey = type === 'new' ? 'newWordsVocabulary' : 'reviewWordsVocabulary';
    const storedWords = Taro.getStorageSync(storageKey);

    if (storedWords && storedWords.length > 0) {
      setWords(storedWords);
      // 同时保存到当前听写词库
      Taro.setStorageSync('dictationWords', storedWords);
    } else {
      Taro.showToast({ title: type === 'new' ? '没有新单词' : '复习词库为空', icon: 'none' });
      setTimeout(() => {
        Taro.navigateBack();
      }, 1500);
    }
  };

  // 当前单词
  const currentWord = words[currentIndex] || null;

  // 开始听写（朗读单词）
  const handleStartDictation = async () => {
    if (!currentWord) return;

    setPhase('listening');
    setIsPlaying(true);

    try {
      // 调用 TTS 接口朗读单词
      const res = await Network.request({
        url: '/api/dictation/speak-word',
        method: 'POST',
        data: { word: currentWord.word },
      });

      console.log('朗读响应:', res);

      if (res?.data?.audioUrl) {
        // 播放音频（小程序端）
        const innerAudioContext = Taro.createInnerAudioContext();
        innerAudioContext.src = res.data.audioUrl;
        innerAudioContext.onPlay(() => {
          console.log('开始播放');
        });
        innerAudioContext.onEnded(() => {
          setIsPlaying(false);
          setPhase('answering');
        });
        innerAudioContext.onError((err) => {
          console.error('播放失败:', err);
          setIsPlaying(false);
          setPhase('answering');
        });
        innerAudioContext.play();
      } else {
        // 没有音频URL，直接进入答题阶段（显示单词让用户回答）
        setIsPlaying(false);
        setPhase('answering');
      }
    } catch (error) {
      console.error('朗读失败:', error);
      setIsPlaying(false);
      setPhase('answering');
    }
  };

  // 检查答案
  const handleCheckAnswer = async (answerType: 'answer' | 'unknown') => {
    if (answerType === 'unknown') {
      // 用户说不知道，加入复习词库
      addToReviewVocabulary(currentWord);
      
      const result: DictationResult = {
        word: currentWord!.word,
        userAnswer: '不知道',
        isCorrect: false,
        correctMeaning: currentWord!.meanings.join('；'),
        addedToReview: true,
      };
      setResults([...results, result]);
      
      // 进入下一个单词或结束
      moveToNext();
      return;
    }

    if (!userAnswer.trim()) {
      Taro.showToast({ title: '请输入中文含义', icon: 'none' });
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
          userAnswer: userAnswer.trim(),
        },
      });

      console.log('检查响应:', res);

      const correct = res?.data?.isCorrect || false;

      setIsCorrect(correct);

      const result: DictationResult = {
        word: currentWord!.word,
        userAnswer: userAnswer.trim(),
        isCorrect: correct,
        correctMeaning: res?.data?.matchedMeaning || currentWord!.meanings.join('；'),
        addedToReview: false,
      };
      setResults([...results, result]);

      // 如果是复习词库且答对了，从复习词库删除
      if (dictationType === 'review' && correct) {
        removeFromReviewVocabulary(currentWord!.word);
      }

      // 如果答错了，加入复习词库
      if (!correct && dictationType === 'new') {
        addToReviewVocabulary(currentWord);
        result.addedToReview = true;
      }

      setPhase('result');
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
    // 检查是否已存在
    const exists = reviewWords.some((w: WordItem) => w.word === word.word);
    if (!exists) {
      reviewWords.push({
        ...word,
        addedDate: new Date().toLocaleDateString('zh-CN'),
      });
      Taro.setStorageSync('reviewWordsVocabulary', reviewWords);
      Taro.showToast({ title: '已加入复习词库', icon: 'none', duration: 1000 });
    }
  };

  // 从复习词库删除
  const removeFromReviewVocabulary = (wordText: string) => {
    const reviewWords = Taro.getStorageSync('reviewWordsVocabulary') || [];
    const updatedWords = reviewWords.filter((w: WordItem) => w.word !== wordText);
    Taro.setStorageSync('reviewWordsVocabulary', updatedWords);
    Taro.showToast({ title: '已从复习词库移除', icon: 'success', duration: 1000 });
  };

  // 进入下一个单词
  const moveToNext = () => {
    setUserAnswer('');
    setIsCorrect(null);
    
    if (currentIndex < words.length - 1) {
      setCurrentIndex(currentIndex + 1);
      setPhase('ready');
    } else {
      // 听写结束，显示结果
      setPhase('result');
      showFinalResults();
    }
  };

  // 继续下一个
  const handleContinue = () => {
    moveToNext();
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

  // 返回首页
  const handleBackToHome = () => {
    Taro.navigateTo({ url: '/pages/index/index' });
  };

  // 重新听写当前单词
  const handleRepeatWord = () => {
    setPhase('ready');
    setUserAnswer('');
    setIsCorrect(null);
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
              className="h-full bg-blue-500 rounded-full transition-all"
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

          {phase === 'listening' && (
            <View className="text-center py-8">
              <View className="w-16 h-16 mx-auto mb-4 rounded-full bg-blue-100 flex items-center justify-center">
                <Volume2 size={32} color="#3b82f6" className={isPlaying ? 'animate-pulse' : ''} />
              </View>
              <Text className="block text-lg text-gray-600">
                {isPlaying ? '正在朗读单词...' : '请听单词读音'}
              </Text>
            </View>
          )}

          {phase === 'answering' && (
            <View className="space-y-4">
              <View className="text-center mb-4">
                <Text className="block text-2xl font-bold text-gray-800">
                  {currentWord?.word}
                </Text>
                {currentWord?.phonetic && (
                  <Text className="block text-sm text-gray-500 mt-1">
                    {currentWord.phonetic}
                  </Text>
                )}
              </View>

              <View className="bg-gray-50 rounded-xl p-3">
                <Input
                  className="w-full bg-transparent"
                  placeholder="请输入中文含义"
                  value={userAnswer}
                  onInput={(e) => setUserAnswer(e.detail.value)}
                />
              </View>

              <View className="flex gap-3">
                <Button
                  onClick={() => handleCheckAnswer('answer')}
                  disabled={isChecking}
                  className="flex-1 bg-blue-500 text-white rounded-xl"
                >
                  <View className="flex items-center justify-center gap-2">
                    <Check size={18} color="#ffffff" />
                    <Text className="text-white">确认</Text>
                  </View>
                </Button>
                <Button
                  onClick={() => handleCheckAnswer('unknown')}
                  className="flex-1 bg-gray-200 text-gray-700 rounded-xl"
                >
                  <View className="flex items-center justify-center gap-2">
                    <CircleQuestionMark size={18} color="#6b7280" />
                    <Text>不知道</Text>
                  </View>
                </Button>
              </View>
            </View>
          )}

          {phase === 'result' && currentIndex < words.length - 1 && (
            <View className="space-y-4">
              <View className="text-center">
                <View className={`w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center ${isCorrect ? 'bg-green-100' : 'bg-red-100'}`}>
                  {isCorrect ? <Check size={32} color="#22c55e" /> : <X size={32} color="#ef4444" />}
                </View>
                <Text className={`block text-lg font-semibold ${isCorrect ? 'text-green-600' : 'text-red-600'}`}>
                  {isCorrect ? '正确！' : '错误'}
                </Text>
              </View>

              {!isCorrect && (
                <View className="bg-gray-50 rounded-xl p-3">
                  <Text className="block text-sm text-gray-600 mb-1">正确答案：</Text>
                  <Text className="block text-gray-800">{results[results.length - 1]?.correctMeaning}</Text>
                </View>
              )}

              <Button
                onClick={handleContinue}
                className="w-full bg-blue-500 text-white rounded-xl"
              >
                <View className="flex items-center justify-center gap-2">
                  <SkipForward size={18} color="#ffffff" />
                  <Text className="text-white">下一个单词</Text>
                </View>
              </Button>
            </View>
          )}
        </CardContent>
      </Card>

      {/* 操作按钮 */}
      <View className="flex gap-3">
        <Button
          onClick={handleRepeatWord}
          className="flex-1 bg-gray-100 text-gray-700 rounded-xl"
        >
          <View className="flex items-center justify-center gap-2">
            <RotateCcw size={18} color="#6b7280" />
            <Text>重听</Text>
          </View>
        </Button>
        <Button
          onClick={handleBackToHome}
          className="flex-1 bg-gray-100 text-gray-700 rounded-xl"
        >
          <View className="flex items-center justify-center gap-2">
            <House size={18} color="#6b7280" />
            <Text>返回首页</Text>
          </View>
        </Button>
      </View>
    </View>
  );
};

export default DictationPage;