import { View, Text, Image, Canvas } from '@tarojs/components';
import Taro, { useLoad, useReady } from '@tarojs/taro';
import { useState, useRef, useCallback } from 'react';
import { Network } from '@/network';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Camera, Check, X, Play, RefreshCw } from 'lucide-react-taro';
import './index.css';

interface WordItem {
  word: string;
  phonetic: string;
  meaning: string;
}

interface SelectionRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const IndexPage = () => {
  const [imagePath, setImagePath] = useState<string>('');
  const [imageUrl, setImageUrl] = useState<string>('');
  const [selections, setSelections] = useState<SelectionRect[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentSelection, setCurrentSelection] = useState<SelectionRect | null>(null);
  const [words, setWords] = useState<WordItem[]>([]);
  const [isRecognizing, setIsRecognizing] = useState(false);
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [canvasReady, setCanvasReady] = useState(false);
  
  const startPosRef = useRef({ x: 0, y: 0 });
  const canvasId = 'selectionCanvas';

  // 平台检测
  const isMiniApp = [Taro.ENV_TYPE.WEAPP, Taro.ENV_TYPE.TT].includes(Taro.getEnv() as typeof Taro.ENV_TYPE.WEAPP | typeof Taro.ENV_TYPE.TT);

  useLoad(() => {
    console.log('单词听写小程序已加载');
  });

  useReady(() => {
    if (imagePath && isMiniApp) {
      initCanvas();
    }
  });

  // 初始化 Canvas
  const initCanvas = useCallback(() => {
    if (!isMiniApp) return;
    
    const ctx = Taro.createCanvasContext(canvasId);
    if (ctx) {
      setCanvasReady(true);
      console.log('Canvas 初始化成功');
    }
  }, [isMiniApp]);

  // 选择图片
  const handleChooseImage = async () => {
    try {
      const res = await Taro.chooseImage({
        count: 1,
        sizeType: ['compressed'],
        sourceType: ['album', 'camera']
      });

      const tempFilePath = res.tempFilePaths[0];
      setImagePath(tempFilePath);
      setSelections([]);
      setWords([]);

      // 获取图片尺寸
      Taro.getImageInfo({
        src: tempFilePath,
        success: (info) => {
          setImageSize({ width: info.width, height: info.height });
        }
      });

      // 上传图片到后端获取 URL
      try {
        const uploadRes = await Network.uploadFile({
          url: '/api/dictation/upload-image',
          filePath: tempFilePath,
          name: 'image'
        });
        
        console.log('上传响应:', uploadRes.data);
        const data = uploadRes.data as any;
        if (data?.data?.imageUrl) {
          setImageUrl(data.data.imageUrl);
        }
      } catch (uploadErr) {
        console.error('图片上传失败:', uploadErr);
      }

      if (isMiniApp) {
        setTimeout(() => initCanvas(), 100);
      }
    } catch (err) {
      console.error('选择图片失败:', err);
      Taro.showToast({ title: '选择图片失败', icon: 'none' });
    }
  };

  // Canvas 触摸开始
  const handleTouchStart = (e: any) => {
    if (!isMiniApp || !canvasReady) return;
    
    const touch = e.touches[0];
    const rect = e.currentTarget?.offset || { left: 0, top: 0 };
    
    startPosRef.current = {
      x: touch.x - rect.left,
      y: touch.y - rect.top
    };
    
    setIsDrawing(true);
    setCurrentSelection({
      x: startPosRef.current.x,
      y: startPosRef.current.y,
      width: 0,
      height: 0
    });
  };

  // Canvas 触摸移动
  const handleTouchMove = (e: any) => {
    if (!isDrawing || !isMiniApp || !canvasReady) return;
    
    const touch = e.touches[0];
    const rect = e.currentTarget?.offset || { left: 0, top: 0 };
    
    const currentX = touch.x - rect.left;
    const currentY = touch.y - rect.top;
    
    const width = currentX - startPosRef.current.x;
    const height = currentY - startPosRef.current.y;
    
    setCurrentSelection({
      x: width < 0 ? currentX : startPosRef.current.x,
      y: height < 0 ? currentY : startPosRef.current.y,
      width: Math.abs(width),
      height: Math.abs(height)
    });

    // 绘制 Canvas
    drawCanvas();
  };

  // Canvas 触摸结束
  const handleTouchEnd = () => {
    if (!isDrawing || !currentSelection) return;
    
    setIsDrawing(false);
    
    // 只有足够大的选区才保存
    if (currentSelection.width > 20 && currentSelection.height > 20) {
      setSelections(prev => [...prev, currentSelection]);
    }
    
    setCurrentSelection(null);
    
    // 重绘所有选区
    setTimeout(() => drawCanvas(), 50);
  };

  // 绘制 Canvas
  const drawCanvas = () => {
    if (!isMiniApp) return;
    
    const ctx = Taro.createCanvasContext(canvasId);
    
    // 清空画布
    ctx.clearRect(0, 0, imageSize.width, imageSize.height);
    
    // 绘制所有已保存的选区
    selections.forEach((rect, index) => {
      ctx.setStrokeStyle('#1890ff');
      ctx.setLineWidth(2);
      ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
      
      // 绘制序号
      ctx.setFillStyle('#1890ff');
      ctx.setFontSize(12);
      ctx.fillText(`${index + 1}`, rect.x + 2, rect.y + 12);
    });
    
    // 绘制当前正在绘制的选区
    if (currentSelection && currentSelection.width > 0) {
      ctx.setStrokeStyle('#ff6b6b');
      ctx.setLineWidth(2);
      ctx.strokeRect(currentSelection.x, currentSelection.y, currentSelection.width, currentSelection.height);
    }
    
    ctx.draw();
  };

  // 清除所有选区
  const handleClearSelections = () => {
    setSelections([]);
    if (isMiniApp) {
      const ctx = Taro.createCanvasContext(canvasId);
      ctx.clearRect(0, 0, imageSize.width, imageSize.height);
      ctx.draw();
    }
  };

  // 删除单个选区
  const handleRemoveSelection = (index: number) => {
    setSelections(prev => prev.filter((_, i) => i !== index));
    setTimeout(() => drawCanvas(), 50);
  };

  // 提交识别
  const handleRecognize = async () => {
    if (!imageUrl || selections.length === 0) {
      Taro.showToast({ title: '请先上传图片并圈选单词', icon: 'none' });
      return;
    }

    setIsRecognizing(true);

    try {
      const res = await Network.request({
        url: '/api/dictation/recognize-words',
        method: 'POST',
        data: {
          imageUrl,
          selections
        }
      });

      console.log('识别响应:', res.data);
      const data = res.data as any;
      
      if (data?.data?.words) {
        setWords(data.data.words);
        Taro.showToast({ title: `识别成功，共 ${data.data.words.length} 个单词`, icon: 'success' });
      } else {
        Taro.showToast({ title: '未识别到单词', icon: 'none' });
      }
    } catch (err) {
      console.error('识别失败:', err);
      Taro.showToast({ title: '识别失败，请重试', icon: 'none' });
    } finally {
      setIsRecognizing(false);
    }
  };

  // 开始听写
  const handleStartDictation = () => {
    if (words.length === 0) {
      Taro.showToast({ title: '请先识别单词', icon: 'none' });
      return;
    }

    // 将单词数据存储到全局，跳转到听写页面
    Taro.setStorageSync('dictationWords', words);
    Taro.navigateTo({ url: '/pages/dictation/index' });
  };

  // 重置全部
  const handleReset = () => {
    setImagePath('');
    setImageUrl('');
    setSelections([]);
    setWords([]);
    setImageSize({ width: 0, height: 0 });
    setCurrentSelection(null);
  };

  return (
    <View className="min-h-full bg-gray-50 p-4">
      {/* 标题 */}
      <View className="mb-4">
        <Text className="block text-xl font-bold text-gray-800 text-center">单词听写助手</Text>
        <Text className="block text-sm text-gray-500 text-center mt-1">拍照上传 → 圈选单词 → 开始听写</Text>
      </View>

      {/* 步骤指示 */}
      <Progress 
        value={words.length > 0 ? 100 : imagePath ? 50 : 0} 
        className="mb-4"
      />

      {/* 图片上传区域 */}
      {!imagePath ? (
        <Card className="mb-4">
          <CardContent className="p-6">
            <View 
              className="flex flex-col items-center justify-center gap-4 cursor-pointer"
              onClick={handleChooseImage}
            >
              <Camera size={48} color="#1890ff" />
              <Text className="block text-gray-600">点击拍照或选择图片</Text>
              <Text className="block text-sm text-gray-400">支持相册选择或相机拍摄</Text>
            </View>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* 图片预览与圈选 */}
          <Card className="mb-4">
            <CardHeader className="pb-2">
              <View className="flex flex-row justify-between items-center">
                <CardTitle>圈选单词区域</CardTitle>
                <View className="flex flex-row gap-2">
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={handleClearSelections}
                  >
                    <X size={16} color="#1890ff" className="mr-1" />
                    <Text>清除</Text>
                  </Button>
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={handleChooseImage}
                  >
                    <RefreshCw size={16} color="#1890ff" className="mr-1" />
                    <Text>换图</Text>
                  </Button>
                </View>
              </View>
            </CardHeader>
            <CardContent className="p-2">
              {/* 图片与Canvas */}
              <View 
                className="relative overflow-hidden rounded-lg bg-white"
                style={{ maxHeight: '300px' }}
              >
                <Image 
                  src={imagePath}
                  mode="widthFix"
                  className="w-full"
                  style={{ maxHeight: '300px' }}
                />
                {isMiniApp && (
                  <Canvas 
                    canvasId={canvasId}
                    className="absolute top-0 left-0 w-full h-full"
                    style={{ 
                      width: `${imageSize.width}px`, 
                      height: `${imageSize.height}px`,
                      maxWidth: '100%',
                      maxHeight: '300px'
                    }}
                    onTouchStart={handleTouchStart}
                    onTouchMove={handleTouchMove}
                    onTouchEnd={handleTouchEnd}
                  />
                )}
                {!isMiniApp && (
                  <View className="absolute top-0 left-0 w-full h-full flex items-center justify-center bg-black bg-opacity-30">
                    <Text className="block text-white text-center text-sm p-2">
                      圈选功能仅在小程序中可用{'\n'}请使用小程序体验完整功能
                    </Text>
                  </View>
                )}
              </View>
              
              {/* 选区列表 */}
              {selections.length > 0 && (
                <View className="mt-2 flex flex-row gap-1 flex-wrap">
                  {selections.map((_, index) => (
                    <View 
                      key={index}
                      className="flex flex-row items-center bg-blue-100 rounded px-2 py-1"
                    >
                      <Text className="block text-sm text-blue-600">区域 {index + 1}</Text>
                      <View onClick={() => handleRemoveSelection(index)}>
                        <X size={14} color="#1890ff" />
                      </View>
                    </View>
                  ))}
                </View>
              )}
              
              <Text className="block text-xs text-gray-400 mt-2">
                在图片上拖动绘制矩形，圈出要听写的单词区域
              </Text>
            </CardContent>
          </Card>

          {/* 识别按钮 */}
          <Button 
            className="w-full mb-4"
            disabled={selections.length === 0 || isRecognizing}
            onClick={handleRecognize}
          >
            {isRecognizing ? (
              <Text>正在识别...</Text>
            ) : (
              <>
                  <Check size={18} color="#1890ff" className="mr-2" />
                <Text>识别单词 ({selections.length} 个区域)</Text>
              </>
            )}
          </Button>
        </>
      )}

      {/* 识别结果 */}
      {words.length > 0 && (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle>已识别单词 ({words.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <View className="flex flex-col gap-2">
              {words.map((word, index) => (
                <View 
                  key={index}
                  className="flex flex-row items-center justify-between bg-gray-50 rounded-lg p-3"
                >
                  <View className="flex flex-col">
                    <Text className="block font-semibold text-gray-800">{word.word}</Text>
                    <Text className="block text-sm text-gray-500">{word.phonetic}</Text>
                  </View>
                  <Text className="block text-sm text-gray-600">{word.meaning}</Text>
                </View>
              ))}
            </View>
            
            {/* 开始听写按钮 */}
            <Button 
              className="w-full mt-4"
              onClick={handleStartDictation}
            >
              <Play size={18} color="#1890ff" className="mr-2" />
              <Text>开始听写</Text>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* 重置按钮 */}
      {(imagePath || words.length > 0) && (
        <Button 
          className="w-full"
          variant="outline"
          onClick={handleReset}
        >
          <Text>重新开始</Text>
        </Button>
      )}
    </View>
  );
};

export default IndexPage;