import { useState, useRef } from 'react'
import { View, Text, Image } from '@tarojs/components'
import Taro, { useLoad } from '@tarojs/taro'
import { Network } from '@/network'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { ImageUp, ArrowLeft, Trash2 } from 'lucide-react-taro'

interface WordItem {
  word: string
  meanings: string[]
  date: string
}

export default function Upload() {
  const [imageUrl, setImageUrl] = useState('')
  const [words, setWords] = useState<WordItem[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [isRecognizing, setIsRecognizing] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const choosingRef = useRef(false)

  useLoad(() => {
    console.log('[Upload] 页面加载')
  })

  const handleChooseImage = async () => {
    console.log('[选图片] 按钮被点击')
    if (choosingRef.current) {
      console.log('[选图片] 正在选择中，跳过')
      return
    }
    choosingRef.current = true
    try {
      const res = await Taro.chooseImage({
        count: 1,
        sizeType: ['compressed'],
        sourceType: ['album', 'camera'],
      })
      console.log('[选图片] 返回:', JSON.stringify(res))
      if (res.tempFilePaths && res.tempFilePaths.length > 0) {
        await uploadImage(res.tempFilePaths[0])
      }
    } catch (err: any) {
      console.error('[选图片] 错误:', JSON.stringify(err))
      if (err?.errMsg?.includes('cancel')) {
        console.log('[选图片] 用户取消选择')
      } else {
        Taro.showToast({ title: '选择图片失败，请重试', icon: 'none' })
      }
    } finally {
      setTimeout(() => { choosingRef.current = false }, 500)
    }
  }

  const uploadImage = async (tempFilePath: string) => {
    setIsUploading(true)
    setErrorMsg('')
    try {
      console.log('[上传] 开始上传:', tempFilePath)
      const res = await Network.uploadFile({
        url: '/api/dictation/upload-image',
        filePath: tempFilePath,
        name: 'file',
      })
      console.log('[上传] 响应:', res)
      const uploadData = JSON.parse(res.data)
      const url = uploadData?.data?.imageUrl
      if (url) {
        setImageUrl(url)
        Taro.showToast({ title: '上传成功', icon: 'success' })
      } else {
        setErrorMsg('上传失败，请重试')
      }
    } catch (err) {
      console.error('[上传] 错误:', err)
      setErrorMsg('上传失败，请检查网络')
    } finally {
      setIsUploading(false)
    }
  }

  const handleRecognize = async () => {
    if (!imageUrl) {
      setErrorMsg('请先上传照片')
      return
    }
    setIsRecognizing(true)
    setErrorMsg('')
    try {
      console.log('[识别] 开始识别:', imageUrl)
      const res = await Network.request({
        url: '/api/dictation/recognize-all-words',
        method: 'POST',
        data: { imageUrl },
      })
      console.log('[识别] 响应:', res)
      const responseData = res?.data as any
      if (responseData?.code !== 200) {
        setErrorMsg(responseData?.msg || '识别失败，请重试')
        return
      }
      const wordsData = responseData?.data?.words || responseData?.words
      if (wordsData && Array.isArray(wordsData) && wordsData.length > 0) {
        const wordItems: WordItem[] = wordsData.map((w: any) => ({
          word: w.word,
          meanings: w.meanings || [],
          date: new Date().toISOString().split('T')[0],
        }))
        setWords(wordItems)
        // 追加到新单词词库（后端已处理追加逻辑，这里同步本地存储）
        const raw = Taro.getStorageSync('new_vocabulary')
        let existing: WordItem[] = []
        if (raw) {
          try {
            existing = typeof raw === 'string' ? JSON.parse(raw) : raw
          } catch { existing = [] }
        }
        const existingWordSet = new Set(existing.map((w: WordItem) => w.word.toLowerCase()))
        const newEntries = wordItems.filter(w => !existingWordSet.has(w.word.toLowerCase()))
        const merged = [...newEntries, ...existing]
        Taro.setStorageSync('new_vocabulary', JSON.stringify(merged))
        Taro.showToast({ title: `识别到 ${wordItems.length} 个单词`, icon: 'success' })
      } else {
        const raw = responseData?.data?.raw
        setErrorMsg('未识别到单词，请确认图片清晰且包含英文单词' + (raw ? `（LLM返回：${raw.substring(0, 100)}）` : ''))
      }
    } catch (err) {
      console.error('[识别] 错误:', err)
      setErrorMsg('网络请求失败，请检查后端服务')
    } finally {
      setIsRecognizing(false)
    }
  }

  const handleClear = () => {
    setImageUrl('')
    setWords([])
    setErrorMsg('')
  }

  return (
    <View className="flex flex-col h-full bg-gray-50">
      {/* 顶部导航 */}
      <View className="bg-white px-4 py-3 flex flex-row items-center gap-3 border-b border-gray-100">
        <Button variant="ghost" size="sm" onClick={() => Taro.navigateBack()}>
          <ArrowLeft size={20} color="#666" />
        </Button>
        <Text className="block text-lg font-semibold text-gray-800">拍照识别单词</Text>
      </View>

      <View className="flex-1 px-4 py-4 overflow-y-auto">
        {/* 操作区 */}
        {!imageUrl ? (
          <Card>
            <CardContent className="p-6 flex flex-col items-center gap-4">
              <View className="w-20 h-20 rounded-full bg-blue-50 flex items-center justify-center">
                <ImageUp size={36} color="#3b82f6" />
              </View>
              <Text className="block text-gray-500 text-sm text-center">
                拍照或从相册选择包含英文单词的图片
              </Text>
              <Button
                variant="outline"
                className="w-full py-3"
                onClick={handleChooseImage}
                disabled={isUploading}
              >
                {isUploading ? '上传中...' : '选图片'}
              </Button>
            </CardContent>
          </Card>
        ) : (
          <View className="flex flex-col gap-4">
            {/* 图片预览 */}
            <Card>
              <CardContent className="p-3">
                <Image src={imageUrl} className="w-full rounded-lg" mode="widthFix" />
              </CardContent>
            </Card>

            {/* 操作按钮 */}
            <View className="flex flex-row gap-3">
              <Button
                variant="outline"
                className="flex-1 py-3"
                onClick={handleChooseImage}
                disabled={isUploading || isRecognizing}
              >
                重选图片
              </Button>
              <Button
                className="flex-1 bg-blue-500 text-white rounded-xl py-3"
                onClick={handleRecognize}
                disabled={isRecognizing || isUploading}
              >
                {isRecognizing ? '识别中...' : '识别单词'}
              </Button>
            </View>

            {/* 错误提示 */}
            {errorMsg ? (
              <View className="bg-red-50 rounded-xl p-3">
                <Text className="block text-red-600 text-sm">{errorMsg}</Text>
              </View>
            ) : null}

            {/* 识别结果 */}
            {words.length > 0 && (
              <View>
                <View className="flex flex-row items-center justify-between mb-3">
                  <Text className="block text-sm font-semibold text-gray-600">
                    识别结果（{words.length} 个单词）
                  </Text>
                  <Button variant="ghost" size="sm" onClick={handleClear}>
                    <Trash2 size={14} color="#ef4444" />
                    <Text className="text-red-500 text-xs ml-1">清除</Text>
                  </Button>
                </View>
                <Separator className="mb-3" />
                <View className="flex flex-col gap-2">
                  {words.map((w, idx) => (
                    <Card key={idx}>
                      <CardContent className="p-3 flex flex-row items-center justify-between">
                        <View>
                          <Text className="block font-semibold text-gray-800">{w.word}</Text>
                          <Text className="block text-xs text-gray-500">
                            {w.meanings.join('；') || '暂无含义'}
                          </Text>
                        </View>
                        <Badge variant="secondary" className="text-xs">已追加</Badge>
                      </CardContent>
                    </Card>
                  ))}
                </View>
              </View>
            )}
          </View>
        )}
      </View>
    </View>
  )
}
