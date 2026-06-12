// Fix: 修复图片识别数据解析路径（Bug 1）
import { useState } from 'react'
import { View, Text, Image } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { Network } from '@/network'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Camera, ImageUp, ArrowLeft, Loader } from 'lucide-react-taro'
import './index.css'

interface WordItem {
  word: string
  meanings: string[]
  date: string
}

export default function UploadPage() {
  const [imageUrl, setImageUrl] = useState('')
  const [isUploading, setIsUploading] = useState(false)
  const [isRecognizing, setIsRecognizing] = useState(false)
  const [words, setWords] = useState<WordItem[]>([])
  const [errorMsg, setErrorMsg] = useState('')

  // 选择图片
  const handleChooseImage = async () => {
    try {
      const res = await Taro.chooseImage({
        count: 1,
        sizeType: ['compressed'],
        sourceType: ['album', 'camera']
      })
      if (res.tempFilePaths && res.tempFilePaths.length > 0) {
        await uploadImage(res.tempFilePaths[0])
      }
    } catch (err) {
      console.error('选择图片失败:', err)
    }
  }

  // Fix Bug 1: 正确解析 Network.uploadFile 返回数据
  const uploadImage = async (filePath: string) => {
    setIsUploading(true)
    setErrorMsg('')
    try {
      const uploadRes = await Network.uploadFile({
        url: '/api/dictation/upload-image',
        filePath,
        name: 'image'
      })
      console.log('Upload response:', uploadRes)

      // Network.uploadFile 返回 { statusCode, data: JSON字符串 }
      // data 是后端响应体: { code, msg, data: { imageUrl, fileKey } }
      let responseData: unknown = uploadRes?.data
      if (typeof responseData === 'string') {
        responseData = JSON.parse(responseData)
      }

      const dataObj = responseData as Record<string, unknown>
      const innerData = dataObj?.data as Record<string, unknown> | undefined
      const imageUrlFromServer = (innerData?.imageUrl || dataObj?.imageUrl) as string | undefined
      if (imageUrlFromServer) {
        setImageUrl(imageUrlFromServer)
        console.log('Image URL set:', imageUrlFromServer)
        Taro.showToast({ title: '上传成功', icon: 'success' })
      } else {
        setErrorMsg('上传失败，未获取到图片地址')
        console.error('No imageUrl in response:', responseData)
      }
    } catch (err) {
      console.error('上传失败:', err)
      setErrorMsg('上传失败，请重试')
    } finally {
      setIsUploading(false)
    }
  }

  // Fix Bug 1: 正确解析识别结果
  const handleRecognize = async () => {
    if (!imageUrl) {
      setErrorMsg('请先上传照片')
      return
    }
    setIsRecognizing(true)
    setErrorMsg('')
    try {
      const res = await Network.request({
        url: '/api/dictation/recognize-all-words',
        method: 'POST',
        data: { imageUrl }
      })
      console.log('Recognize response:', res)

      // Network.request 返回 { statusCode, data: 后端响应体 }
      // 后端响应体: { code, msg, data: { words: [...], count } }
      const responseData = res?.data
      const wordsData = responseData?.data?.words || responseData?.words

      if (wordsData && Array.isArray(wordsData) && wordsData.length > 0) {
        // 将识别结果转换为 WordItem 格式
        const wordItems: WordItem[] = wordsData.map((w: { word: string; meanings?: string[] }) => ({
          word: w.word,
          meanings: w.meanings || [],
          date: new Date().toISOString().split('T')[0]
        }))
        setWords(wordItems)
        // Fix Bug 1: 存入新单词词库（覆盖替换）
        Taro.setStorageSync('new_vocabulary', JSON.stringify(wordItems))
        Taro.showToast({ title: `识别到 ${wordItems.length} 个单词`, icon: 'success' })
      } else {
        setErrorMsg('未识别到单词，请确认图片清晰且包含英文单词')
      }
    } catch (err) {
      console.error('识别失败:', err)
      setErrorMsg('识别失败，请重试')
    } finally {
      setIsRecognizing(false)
    }
  }

  // 开始听写
  const handleStartDictation = () => {
    if (words.length === 0) {
      setErrorMsg('请先识别单词')
      return
    }
    Taro.navigateTo({
      url: `/pages/dictation/index?type=new&words=${encodeURIComponent(JSON.stringify(words))}`
    })
  }

  return (
    <View className="flex flex-col min-h-screen bg-white">
      {/* 顶部导航 */}
      <View className="flex flex-row items-center px-4 py-3 border-b border-gray-200">
        <View className="flex flex-row items-center" onClick={() => Taro.navigateBack()}>
          <ArrowLeft size={20} color="#666" />
          <Text className="block text-gray-600 ml-1">返回</Text>
        </View>
        <Text className="block text-lg font-semibold ml-4">上传单词照片</Text>
      </View>

      <View className="flex-1 px-4 py-6">
        {/* 图片预览区 */}
        <View className="mb-6">
          {imageUrl ? (
            <View className="relative">
              <Image
                src={imageUrl}
                className="w-full rounded-xl"
                mode="widthFix"
                style={{ maxHeight: '300px' }}
              />
              <View className="absolute top-2 right-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={handleChooseImage}
                >
                  重新选择
                </Button>
              </View>
            </View>
          ) : (
            <View
              className="flex flex-col items-center justify-center bg-gray-50 rounded-xl border-2 border-dashed border-gray-300 py-16"
              onClick={handleChooseImage}
            >
              {isUploading ? (
                <>
                  <Loader size={40} color="#3b82f6" />
                  <Text className="block text-gray-400 mt-3">上传中...</Text>
                </>
              ) : (
                <>
                  <Camera size={48} color="#9ca3af" />
                  <Text className="block text-gray-400 mt-3">点击拍照或选择图片</Text>
                  <Text className="block text-gray-300 text-sm mt-1">支持 JPG/PNG 格式</Text>
                </>
              )}
            </View>
          )}
        </View>

        {/* 操作按钮 */}
        <View className="flex flex-row gap-3 mb-6">
          <Button
            className="flex-1 bg-blue-500 text-white rounded-xl py-3"
            onClick={handleRecognize}
            disabled={!imageUrl || isRecognizing}
          >
            {isRecognizing ? '识别中...' : '识别单词'}
          </Button>
          <Button
            variant="outline"
            className="flex-1"
            onClick={handleChooseImage}
          >
            <ImageUp size={18} color="#666" />
            <Text className="block text-gray-600 ml-1">选图片</Text>
          </Button>
        </View>

        {/* 错误提示 */}
        {errorMsg && (
          <View className="bg-red-50 rounded-xl px-4 py-3 mb-4">
            <Text className="block text-red-500 text-sm">{errorMsg}</Text>
          </View>
        )}

        {/* 识别结果 */}
        {words.length > 0 && (
          <View className="mb-6">
            <View className="flex flex-row items-center justify-between mb-3">
              <Text className="block text-lg font-semibold">
                识别结果 ({words.length} 个)
              </Text>
              <Badge variant="secondary">新单词词库</Badge>
            </View>
            <View className="bg-gray-50 rounded-xl p-4">
              {words.map((item, index) => (
                <View
                  key={index}
                  className="flex flex-row items-center justify-between py-2 border-b border-gray-100 last:border-b-0"
                >
                  <Text className="block text-base font-medium text-gray-800">{item.word}</Text>
                  <Text className="block text-sm text-gray-500">
                    {item.meanings.length > 0 ? item.meanings.join(' / ') : '待翻译'}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* 开始听写按钮 */}
        {words.length > 0 && (
          <Button
            className="w-full bg-green-500 text-white rounded-xl py-4 text-lg font-semibold"
            onClick={handleStartDictation}
          >
            开始听写 ({words.length} 个单词)
          </Button>
        )}
      </View>
    </View>
  )
}
