import { View, Text } from '@tarojs/components';
import Taro, { useLoad } from '@tarojs/taro';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { BookOpen, RefreshCw, Settings, Plus, Clock } from 'lucide-react-taro';
import './index.css';

interface VocabularyStats {
  newWordsCount: number;
  reviewWordsCount: number;
}

const IndexPage = () => {
  const [stats, setStats] = useState<VocabularyStats>({
    newWordsCount: 0,
    reviewWordsCount: 0,
  });

  useLoad(() => {
    console.log('单词听写小程序已加载');
    loadVocabularyStats();
  });

  // Fix: 统一存储 key
  const loadVocabularyStats = async () => {
    try {
      const newWords = Taro.getStorageSync('new_vocabulary') || [];
      const reviewWords = Taro.getStorageSync('review_vocabulary') || [];
      setStats({
        newWordsCount: newWords.length,
        reviewWordsCount: reviewWords.length,
      });
    } catch (error) {
      console.error('加载词库统计失败:', error);
    }
  };

  // 选择新单词词库
  const handleNewWords = () => {
    Taro.navigateTo({
      url: '/pages/upload/index',
    });
  };

  // 选择复习词库
  const handleReviewWords = () => {
    if (stats.reviewWordsCount === 0) {
      Taro.showToast({
        title: '复习词库为空',
        icon: 'none',
      });
      return;
    }
    // 传递词库类型参数
    Taro.navigateTo({
      url: '/pages/dictation/index?type=review',
    });
  };

  // 进入词库管理
  const handleManageVocabulary = () => {
    Taro.navigateTo({
      url: '/pages/vocabulary/index',
    });
  };

  return (
    <View className="min-h-screen bg-gradient-to-b from-blue-50 to-white p-4">
      {/* 标题区域 */}
      <View className="text-center mb-8 pt-4">
        <Text className="block text-2xl font-bold text-blue-600 mb-2">单词听写助手</Text>
        <Text className="block text-sm text-gray-500">拍照上传，智能听写</Text>
      </View>

      {/* 词库选择卡片 */}
      <View className="space-y-4">
        {/* 新单词词库 */}
        <Card className="shadow-md border-2 border-blue-100 hover:border-blue-300 transition-colors">
          <CardContent className="p-4">
            <View
              className="flex items-center justify-between"
              onClick={handleNewWords}
            >
              <View className="flex items-center gap-3">
                <View className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
                  <BookOpen size={24} color="#3b82f6" />
                </View>
                <View>
                  <Text className="block text-lg font-semibold text-gray-800">新单词</Text>
                  <Text className="block text-sm text-gray-500">上传照片，开始听写</Text>
                </View>
              </View>
              <View className="flex items-center gap-2">
                <View className="px-3 py-1 rounded-full bg-blue-50">
                  <Text className="text-sm text-blue-600">{stats.newWordsCount} 词</Text>
                </View>
                <Plus size={20} color="#3b82f6" />
              </View>
            </View>
          </CardContent>
        </Card>

        {/* 复习词库 */}
        <Card className="shadow-md border-2 border-orange-100 hover:border-orange-300 transition-colors">
          <CardContent className="p-4">
            <View
              className="flex items-center justify-between"
              onClick={handleReviewWords}
            >
              <View className="flex items-center gap-3">
                <View className="w-12 h-12 rounded-full bg-orange-100 flex items-center justify-center">
                  <RefreshCw size={24} color="#f97316" />
                </View>
                <View>
                  <Text className="block text-lg font-semibold text-gray-800">复习</Text>
                  <Text className="block text-sm text-gray-500">巩固错词，加深记忆</Text>
                </View>
              </View>
              <View className="flex items-center gap-2">
                <View className="px-3 py-1 rounded-full bg-orange-50">
                  <Text className="text-sm text-orange-600">{stats.reviewWordsCount} 词</Text>
                </View>
                {stats.reviewWordsCount > 0 && (
                  <Clock size={20} color="#f97316" />
                )}
              </View>
            </View>
          </CardContent>
        </Card>
      </View>

      {/* 词库管理按钮 */}
      <View className="mt-8">
        <Button
          onClick={handleManageVocabulary}
          className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl py-3 flex items-center justify-center gap-2"
        >
          <Settings size={18} color="#6b7280" />
          <Text>词库管理</Text>
        </Button>
      </View>

      {/* 使用说明 */}
      <View className="mt-8 p-4 bg-white rounded-xl shadow-sm">
        <Text className="block text-sm font-semibold text-gray-700 mb-2">使用说明</Text>
        <View className="space-y-2">
          <Text className="block text-xs text-gray-500">1. 选择「新单词」上传照片识别单词</Text>
          <Text className="block text-xs text-gray-500">2. 系统自动朗读单词，你说出中文含义</Text>
          <Text className="block text-xs text-gray-500">3. 说错的单词自动加入复习词库</Text>
          <Text className="block text-xs text-gray-500">4. 在「复习」中巩固错词，答对自动移除</Text>
        </View>
      </View>
    </View>
  );
};

export default IndexPage;