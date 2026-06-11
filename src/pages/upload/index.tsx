import { View, Text, Image } from '@tarojs/components';
import Taro, { useLoad } from '@tarojs/taro';
import { useState } from 'react';
import { Network } from '@/network';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Camera, Upload, Loader, Check, ArrowLeft } from 'lucide-react-taro';
import './index.css';

interface WordItem {
  word: string;
  phonetic: string;
  meanings: string[];
  addedDate: string;
}

const UploadPage = () => {
  const [imagePath, setImagePath] = useState<string>('');
  const [imageUrl, setImageUrl] = useState<string>('');
  const [isRecognizing, setIsRecognizing] = useState(false);
  const [recognizedWords, setRecognizedWords] = useState<WordItem[]>([]);
  const [showPreview, setShowPreview] = useState(false);

  useLoad(() => {
    console.log('上传识别页加载');
  });

  // 选择图片
  const handleChooseImage = async () => {
    try {
      const res = await Taro.chooseImage({
        count: 1,
        sizeType: ['compressed'],
        sourceType: ['album', 'camera'],
      });

      const tempFilePath = res.tempFilePaths[0];
      setImagePath(tempFilePath);
      setShowPreview(true);

      // 上传图片到服务器
      const uploadRes = await Network.uploadFile({
        url: '/api/dictation/upload-image',
        filePath: tempFilePath,
        name: 'image',
      });

      console.log('上传响应:', uploadRes);
      console.log('上传响应 data 类型:', typeof uploadRes.data);
      console.log('上传响应 data 内容:', uploadRes.data);

      // Taro.uploadFile 返回的 data 是字符串，需要解析
      // 后端返回格式: { code: 200, msg: 'success', data: { imageUrl: '...' } }
      let responseData: any;
      if (typeof uploadRes.data === 'string') {
        try {
          responseData = JSON.parse(uploadRes.data);
          console.log('解析后的 responseData:', responseData);
          // 如果 responseData.data 也是字符串（某些情况下），再解析一次
          if (typeof responseData.data === 'string') {
            responseData.data = JSON.parse(responseData.data);
          }
        } catch (e) {
          console.error('JSON 解析失败:', e);
          responseData = uploadRes.data;
        }
      } else {
        responseData = uploadRes.data;
      }

      // 提取 imageUrl
      const extractedImageUrl = responseData?.data?.imageUrl || responseData?.imageUrl;
      if (extractedImageUrl) {
        console.log('获取到 imageUrl:', extractedImageUrl);
        setImageUrl(extractedImageUrl);
        Taro.showToast({ title: '图片上传成功', icon: 'success', duration: 1000 });
      } else {
        console.error('未能获取 imageUrl，responseData:', responseData);
        Taro.showToast({ title: '上传失败，请重试', icon: 'none' });
      }
    } catch (error) {
      console.error('选择图片失败:', error);
      Taro.showToast({
        title: '选择图片失败',
        icon: 'none',
      });
    }
  };

  // 识别单词
  const handleRecognize = async () => {
    if (!imageUrl) {
      Taro.showToast({
        title: '请先上传图片',
        icon: 'none',
      });
      return;
    }

    setIsRecognizing(true);
    try {
      const res = await Network.request({
        url: '/api/dictation/recognize-all-words',
        method: 'POST',
        data: { imageUrl },
      });

      console.log('识别响应:', res);

      const words = res?.data?.words || [];
      if (words.length === 0) {
        Taro.showToast({
          title: '未识别到单词',
          icon: 'none',
        });
      } else {
        // 添加入库日期
        const today = new Date().toLocaleDateString('zh-CN');
        const wordsWithDate = words.map((w: WordItem) => ({
          ...w,
          addedDate: today,
        }));
        setRecognizedWords(wordsWithDate);
      }
    } catch (error) {
      console.error('识别失败:', error);
      Taro.showToast({
        title: '识别失败，请重试',
        icon: 'none',
      });
    } finally {
      setIsRecognizing(false);
    }
  };

  // 确认并开始听写
  const handleConfirm = async () => {
    if (recognizedWords.length === 0) {
      Taro.showToast({
        title: '没有识别到单词',
        icon: 'none',
      });
      return;
    }

    // 保存到新单词词库（覆盖）
    Taro.setStorageSync('newWordsVocabulary', recognizedWords);

    // 保存当前听写词库
    Taro.setStorageSync('dictationWords', recognizedWords);
    Taro.setStorageSync('dictationType', 'new');

    Taro.showToast({
      title: `已保存 ${recognizedWords.length} 个单词`,
      icon: 'success',
    });

    // 跳转到听写页
    setTimeout(() => {
      Taro.navigateTo({
        url: '/pages/dictation/index?type=new',
      });
    }, 1000);
  };

  // 返回首页
  const handleBack = () => {
    Taro.navigateBack();
  };

  return (
    <View className="min-h-screen bg-white p-4">
      {/* 头部 */}
      <View className="flex items-center gap-3 mb-4">
        <View onClick={handleBack}>
          <ArrowLeft size={24} color="#3b82f6" />
        </View>
        <Text className="block text-xl font-semibold text-gray-800">上传单词照片</Text>
      </View>

      {/* 上传区域 */}
      {!showPreview ? (
        <Card className="shadow-md">
          <CardContent className="p-8">
            <View
              className="flex flex-col items-center justify-center gap-4 border-2 border-dashed border-gray-300 rounded-xl p-8"
              onClick={handleChooseImage}
            >
              <View className="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center">
                <Camera size={32} color="#3b82f6" />
              </View>
              <Text className="block text-gray-600">点击拍照或选择照片</Text>
              <Text className="block text-xs text-gray-400">支持包含单词列表的照片</Text>
            </View>
          </CardContent>
        </Card>
      ) : (
        <View className="space-y-4">
          {/* 图片预览 */}
          <Card className="shadow-md">
            <CardContent className="p-4">
              <Image
                src={imagePath}
                className="w-full rounded-lg"
                mode="widthFix"
              />
            </CardContent>
          </Card>

          {/* 操作按钮 */}
          <View className="flex gap-3">
            <Button
              onClick={handleChooseImage}
              className="flex-1 bg-gray-100 text-gray-700 rounded-xl"
            >
              <View className="flex items-center justify-center gap-2">
                <Upload size={18} color="#6b7280" />
                <Text>重新选择</Text>
              </View>
            </Button>
            <Button
              onClick={handleRecognize}
              disabled={isRecognizing}
              className="flex-1 bg-blue-500 text-white rounded-xl"
            >
              <View className="flex items-center justify-center gap-2">
                {isRecognizing ? (
                  <Loader size={18} color="#ffffff" />
                ) : (
                  <Check size={18} color="#ffffff" />
                )}
                <Text>{isRecognizing ? '识别中...' : '识别单词'}</Text>
              </View>
            </Button>
          </View>

          {/* 识别结果 */}
          {recognizedWords.length > 0 && (
            <Card className="shadow-md border-2 border-green-100">
              <CardContent className="p-4">
                <View className="flex items-center justify-between mb-3">
                  <Text className="block text-lg font-semibold text-green-600">
                    识别完成
                  </Text>
                  <Text className="text-sm text-gray-500">
                    共 {recognizedWords.length} 个单词
                  </Text>
                </View>

                {/* 单词列表预览 */}
                <View className="max-h-60 overflow-y-auto space-y-2">
                  {recognizedWords.map((word, index) => (
                    <View
                      key={index}
                      className="flex items-center justify-between p-2 bg-gray-50 rounded-lg"
                    >
                      <View>
                        <Text className="block font-medium text-gray-800">
                          {word.word}
                        </Text>
                        {word.phonetic && (
                          <Text className="block text-xs text-gray-500">
                            {word.phonetic}
                          </Text>
                        )}
                      </View>
                      <Text className="text-sm text-gray-600">
                        {word.meanings.join('；')}
                      </Text>
                    </View>
                  ))}
                </View>

                {/* 确认按钮 */}
                <Button
                  onClick={handleConfirm}
                  className="w-full mt-4 bg-green-500 text-white rounded-xl py-3"
                >
                  <View className="flex items-center justify-center gap-2">
                    <Check size={20} color="#ffffff" />
                    <Text className="font-semibold">确认并开始听写</Text>
                  </View>
                </Button>
              </CardContent>
            </Card>
          )}
        </View>
      )}

      {/* 使用提示 */}
      <View className="mt-4 p-3 bg-blue-50 rounded-lg">
        <Text className="block text-xs text-blue-600">
          提示：照片中单词格式为「单词 / 音标 词性 中文含义」或「短语 中文含义」
        </Text>
      </View>
    </View>
  );
};

export default UploadPage;