// Fix: 完整重写听写页面，修复所有5个Bug
import { useState, useEffect, useRef, useCallback } from 'react'
import { View, Text, Canvas } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { Network } from '@/network'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Volume2, Mic, Check, ArrowLeft, Pencil } from 'lucide-react-taro'
import './index.css'

interface WordItem {
  word: string
  meanings: string[]
  date: string
}

interface AudioResult {
  usAudioUrl: string
  ukAudioUrl: string
}

// Fix: 统一存储格式辅助函数
const loadWordsFromStorage = (key: string): WordItem[] => {
  const raw = Taro.getStorageSync(key)
  if (!raw) return []
  try {
    return typeof raw === 'string' ? JSON.parse(raw) : raw
  } catch {
    return []
  }
}

// Fix 第五版: 增加超时和错误提示
function playAudioUrl(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!url) {
      Taro.showToast({ title: '音频地址为空', icon: 'none' })
      reject(new Error('音频地址为空'))
      return
    }
    try {
      const audioCtx = Taro.createInnerAudioContext()
      audioCtx.src = url
      audioCtx.autoplay = true
      const timeout = setTimeout(() => {
        audioCtx.destroy()
        Taro.showToast({ title: '播放超时', icon: 'none' })
        reject(new Error('播放超时'))
      }, 10000)
      audioCtx.onEnded(() => {
        clearTimeout(timeout)
        audioCtx.destroy()
        resolve()
      })
      audioCtx.onError((err) => {
        clearTimeout(timeout)
        audioCtx.destroy()
        console.error('播放失败:', err)
        Taro.showToast({ title: '发音加载失败', icon: 'none' })
        reject(err)
      })
    } catch (err) {
      Taro.showToast({ title: '音频播放异常', icon: 'none' })
      reject(err)
    }
  })
}

export default function DictationPage() {
  const [wordList, setWordList] = useState<WordItem[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [totalCount, setTotalCount] = useState(0)
  const [correctCount, setCorrectCount] = useState(0)
  const [phase, setPhase] = useState<'loading' | 'playing' | 'spelling' | 'meaning' | 'complete'>('loading')
  const [spellingInput, setSpellingInput] = useState('')
  const [spellingResult, setSpellingResult] = useState<'correct' | 'wrong' | ''>('')
  const [meaningResult, setMeaningResult] = useState<'correct' | 'wrong' | ''>('')
  const [isRecording, setIsRecording] = useState(false)
  const [feedbackMsg, setFeedbackMsg] = useState('')
  const [vocabularyType, setVocabularyType] = useState<'new' | 'review'>('new')

  // Fix Bug 5: Canvas手写板
  const [showCanvas, setShowCanvas] = useState(false)
  const isDrawingRef = useRef(false)
  const ctxRef = useRef<any>(null)
  const canvasRef = useRef<any>(null) // Fix: 存储canvas node用于导出图片

  const currentWord = wordList[currentIndex]

  // 初始化：从路由参数获取词库类型和单词列表
  useEffect(() => {
    const instance = Taro.getCurrentInstance()
    const params = instance?.router?.params as Record<string, string> | undefined
    if (params?.type) {
      setVocabularyType(params.type as 'new' | 'review')
    }
    if (params?.words) {
      try {
        const words = JSON.parse(decodeURIComponent(params.words)) as WordItem[]
        setWordList(words)
        setTotalCount(words.length)
        setPhase('playing')
      } catch {
        Taro.showToast({ title: '单词数据解析失败', icon: 'none' })
      }
    } else {
      // Fix: 从本地存储加载，使用 loadWordsFromStorage 兼容格式
      const key = params?.type === 'review' ? 'review_vocabulary' : 'new_vocabulary'
      const words = loadWordsFromStorage(key)
      if (words.length > 0) {
        setWordList(words)
        setTotalCount(words.length)
        setPhase('playing')
      } else {
        Taro.showToast({ title: '词库为空，请先添加单词', icon: 'none' })
        setTimeout(() => Taro.navigateBack(), 1500)
      }
    }
  }, [])

  // Fix 第五版: 播放单词发音，确保捕获错误后仍然继续
  const playWord = useCallback(async (word: string) => {
    try {
      const res = await Network.request({
        url: '/api/dictation/speak-word-both',
        method: 'POST',
        data: { word },
        timeout: 15000,
      })
      const responseData = res?.data as Record<string, unknown>
      const innerData = responseData?.data as AudioResult | undefined
      if (responseData?.code === 200 && innerData) {
        const { usAudioUrl, ukAudioUrl } = innerData
        // 先播放美式发音
        if (usAudioUrl) {
          await playAudioUrl(usAudioUrl).catch(e => console.warn('美式发音失败', e))
        }
        // 再播放英式发音
        if (ukAudioUrl && ukAudioUrl !== usAudioUrl) {
          await playAudioUrl(ukAudioUrl).catch(e => console.warn('英式发音失败', e))
        }
      } else {
        Taro.showToast({ title: '无法获取发音', icon: 'none' })
      }
    } catch (err) {
      console.error('playWord error:', err)
      Taro.showToast({ title: '发音获取失败，请重试', icon: 'none' })
    }
  }, [])

  // 开始播放当前单词
  useEffect(() => {
    if (phase === 'playing' && currentWord) {
      playWord(currentWord.word).then(() => {
        setPhase('spelling')
      }).catch(() => {
        setPhase('spelling')
      })
    }
  }, [phase, currentWord, playWord])

  // Fix Bug 4: 中文含义比对 - trim + 忽略大小写 + 去掉标点
  // Fix 第五版: 防止 correctMeanings 为 undefined 或空数组
  const checkMeaning = useCallback((correctMeanings: string[] | undefined, userAnswer: string): boolean => {
    if (!correctMeanings || correctMeanings.length === 0) {
      console.warn('checkMeaning: correctMeanings is empty or undefined')
      return false
    }
    const normalized = userAnswer.trim().toLowerCase().replace(/[，,。.！!？?；;：:、\s]+/g, '')
    return correctMeanings.some((meaning) => {
      if (!meaning) return false
      const normalizedMeaning = meaning.trim().toLowerCase().replace(/[，,。.！!？?；;：:、\s]+/g, '')
      return normalized === normalizedMeaning || normalizedMeaning.includes(normalized) || normalized.includes(normalizedMeaning)
    })
  }, [])

  // Fix Bug 3: 录音识别 — 录音 → 上传到存储 → ASR识别
  const startRecording = useCallback(() => {
    const isMiniApp = Taro.getEnv() === Taro.ENV_TYPE.WEAPP || Taro.getEnv() === Taro.ENV_TYPE.TT
    if (!isMiniApp) {
      Taro.showToast({ title: '语音识别仅在小程序中可用，请手动输入含义', icon: 'none' })
      return
    }
    try {
      const recorderManager = Taro.getRecorderManager()
      recorderManager.onStop((res) => {
        setIsRecording(false)
        if (res.tempFilePath) {
          handleVoiceResult(res.tempFilePath)
        }
      })
      recorderManager.onError(() => {
        setIsRecording(false)
        Taro.showToast({ title: '录音失败', icon: 'none' })
      })
      recorderManager.start({
        format: 'wav',
        sampleRate: 16000,
        numberOfChannels: 1,
      })
      setIsRecording(true)
    } catch {
      Taro.showToast({ title: '录音功能不可用', icon: 'none' })
    }
  }, [])

  const stopRecording = useCallback(() => {
    try {
      const recorderManager = Taro.getRecorderManager()
      recorderManager.stop()
    } catch {
      setIsRecording(false)
    }
  }, [])

  // Fix Bug 3: 录音后上传到存储，再调用ASR
  const handleVoiceResult = async (tempFilePath: string) => {
    try {
      Taro.showLoading({ title: '识别中...' })
      // Step 1: 上传录音文件到对象存储
      const uploadRes = await Network.uploadFile({
        url: '/api/dictation/upload-audio',
        filePath: tempFilePath,
        name: 'audio',
      })
      console.log('Audio upload response:', uploadRes)

      let uploadData: Record<string, unknown> = (typeof uploadRes?.data === 'string' ? JSON.parse(uploadRes.data) : uploadRes?.data) as Record<string, unknown> || {}
      const innerData = uploadData?.data as Record<string, unknown> | undefined
      const audioUrl = (innerData?.audioUrl || uploadData?.audioUrl) as string | undefined

      if (!audioUrl) {
        Taro.hideLoading()
        Taro.showToast({ title: '音频上传失败', icon: 'none' })
        return
      }

      // Step 2: 调用ASR识别
      const res = await Network.request({
        url: '/api/dictation/recognize-speech',
        method: 'POST',
        data: { audioUrl },
      })
      const result = res?.data as Record<string, unknown>
      const asrData = result?.data as { text: string } | undefined
      Taro.hideLoading()

      if (result?.code === 200 && asrData?.text) {
        const recognizedText = asrData.text.trim()
        console.log('ASR recognized:', recognizedText)
        // Fix Bug 4: 比对中文含义
        if (currentWord && checkMeaning(currentWord.meanings, recognizedText)) {
          handleMeaningCorrect()
        } else {
          handleMeaningWrong()
        }
      } else {
        Taro.showToast({ title: '未识别到语音内容，请重试', icon: 'none' })
      }
    } catch (err) {
      Taro.hideLoading()
      console.error('Voice recognition error:', err)
      Taro.showToast({ title: '语音识别失败，请手动输入含义', icon: 'none' })
    }
  }

  // 检查英文拼写
  const handleSpellingSubmit = () => {
    if (!currentWord) return
    // Fix Bug 4: trim + 忽略大小写
    const normalized = spellingInput.trim().toLowerCase()
    const target = currentWord.word.trim().toLowerCase()
    if (normalized === target) {
      setSpellingResult('correct')
      setFeedbackMsg('拼写正确！请说出中文含义')
      setPhase('meaning')
    } else {
      setSpellingResult('wrong')
      setFeedbackMsg(`拼写错误，正确答案是: ${currentWord.word}`)
      // 拼写错误也加入复习库
      addToReview(currentWord)
      setTimeout(() => {
        setSpellingResult('')
        setFeedbackMsg('')
        setSpellingInput('')
        goToNext()
      }, 2000)
    }
  }

  // Fix Bug 3: 正确时自动继续
  const handleMeaningCorrect = () => {
    setMeaningResult('correct')
    setFeedbackMsg('回答正确！')
    setCorrectCount((prev) => prev + 1)
    // 如果是复习词库，从复习库中删除
    if (vocabularyType === 'review') {
      removeFromReview(currentWord)
    }
    setTimeout(() => {
      setMeaningResult('')
      setFeedbackMsg('')
      setSpellingInput('')
      goToNext()
    }, 1500)
  }

  const handleMeaningWrong = () => {
    setMeaningResult('wrong')
    // Fix 第五版: 防止 meanings 为 undefined 或空数组时显示 undefined
    const meaningsDisplay = currentWord?.meanings && currentWord.meanings.length > 0 
      ? currentWord.meanings.join(' / ') 
      : '(暂无含义)'
    setFeedbackMsg(`错误！正确含义: ${meaningsDisplay}`)
    // Fix Bug 3: 答错加入复习库
    addToReview(currentWord)
    setTimeout(() => {
      setMeaningResult('')
      setFeedbackMsg('')
      setSpellingInput('')
      goToNext()
    }, 2500)
  }

  // 用户说"不知道"
  const handleDontKnow = () => {
    if (!currentWord) return
    setFeedbackMsg(`正确答案: ${currentWord.word} - ${currentWord.meanings.join(' / ')}`)
    addToReview(currentWord)
    setTimeout(() => {
      setFeedbackMsg('')
      setSpellingInput('')
      goToNext()
    }, 2500)
  }

  // Fix Bug 3: 加入复习词库
  const addToReview = (word: WordItem) => {
    const reviewList = loadWordsFromStorage('review_vocabulary')
    if (!reviewList.some((w) => w.word === word.word)) {
      reviewList.push({ ...word, date: new Date().toISOString().split('T')[0] })
      Taro.setStorageSync('review_vocabulary', JSON.stringify(reviewList))
    }
  }

  // Fix Bug 3: 从复习词库删除
  const removeFromReview = (word: WordItem) => {
    const reviewList = loadWordsFromStorage('review_vocabulary')
    const updated = reviewList.filter((w) => w.word !== word.word)
    Taro.setStorageSync('review_vocabulary', JSON.stringify(updated))
  }

  const goToNext = () => {
    if (currentIndex + 1 >= wordList.length) {
      setPhase('complete')
    } else {
      setCurrentIndex((prev) => prev + 1)
      setPhase('playing')
    }
  }

  // Fix Bug 5: Canvas手写板 — 使用 Taro Canvas 2D API
  const initCanvas = useCallback(() => {
    if (!showCanvas) return
    // 延迟初始化确保 Canvas 已挂载
    setTimeout(() => {
      const query = Taro.createSelectorQuery()
      query.select('#handwritingCanvas').fields({ node: true, size: true }).exec((res) => {
        if (res && res[0] && res[0].node) {
          const canvas = res[0].node
          const ctx = canvas.getContext('2d')
          const dpr = Taro.getSystemInfoSync().pixelRatio
          canvas.width = res[0].width * dpr
          canvas.height = res[0].height * dpr
          ctx.scale(dpr, dpr)
          ctx.lineCap = 'round'
          ctx.lineJoin = 'round'
          ctx.lineWidth = 3
          ctx.strokeStyle = '#333'
          ctxRef.current = ctx
          canvasRef.current = canvas // Fix: 存储canvas node
        }
      })
    }, 200)
  }, [showCanvas])

  useEffect(() => {
    initCanvas()
  }, [initCanvas])

  const handleTouchStart = (e: any) => {
    isDrawingRef.current = true
    const touch = e.touches?.[0]
    if (touch && ctxRef.current) {
      const ctx = ctxRef.current
      ctx.beginPath()
      ctx.moveTo(touch.x, touch.y)
    }
  }

  const handleTouchMove = (e: any) => {
    if (!isDrawingRef.current) return
    const touch = e.touches?.[0]
    if (touch && ctxRef.current) {
      const ctx = ctxRef.current
      ctx.lineTo(touch.x, touch.y)
      ctx.stroke()
    }
  }

  const handleTouchEnd = () => {
    isDrawingRef.current = false
    if (ctxRef.current) {
      ctxRef.current.closePath()
    }
  }

  const clearCanvas = () => {
    if (canvasRef.current) {
      // Fix: 使用存储的 canvas node
      const canvas = canvasRef.current
      const ctx = canvas.getContext('2d')
      const dpr = Taro.getSystemInfoSync().pixelRatio
      ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr)
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.lineWidth = 3
      ctx.strokeStyle = '#333'
      ctxRef.current = ctx
    }
  }

  // Fix Bug 5: 手写识别提交 — 导出Canvas图片并发送给LLM识别
  const handleHandwritingSubmit = async () => {
    try {
      Taro.showLoading({ title: '识别中...' })
      // Fix: 使用 canvas node 导出图片（Canvas 2D API）
      if (!canvasRef.current) {
        Taro.hideLoading()
        Taro.showToast({ title: 'Canvas未初始化', icon: 'none' })
        return
      }
      const res = await Taro.canvasToTempFilePath({
        canvas: canvasRef.current,
        fileType: 'png',
      })
      if (res.tempFilePath) {
        // 上传手写图片
        const uploadRes = await Network.uploadFile({
          url: '/api/dictation/upload-image',
          filePath: res.tempFilePath,
          name: 'image',
        })
        let uploadData: Record<string, unknown> = (typeof uploadRes?.data === 'string' ? JSON.parse(uploadRes.data) : uploadRes?.data) as Record<string, unknown> || {}
        const innerData = uploadData?.data as Record<string, unknown> | undefined
        const imageUrl = (innerData?.imageUrl || uploadData?.imageUrl) as string | undefined

        if (imageUrl) {
          // 调用LLM识别手写英文
          const recognizeRes = await Network.request({
            url: '/api/dictation/recognize-handwriting',
            method: 'POST',
            data: { imageUrl },
          })
          const result = recognizeRes?.data as Record<string, unknown>
          const hwData = result?.data as { text: string } | undefined
          Taro.hideLoading()
          if (result?.code === 200 && hwData?.text) {
            setSpellingInput(hwData.text.trim())
            setShowCanvas(false)
            Taro.showToast({ title: '识别成功', icon: 'success' })
          } else {
            Taro.showToast({ title: '未识别到文字', icon: 'none' })
          }
        } else {
          Taro.hideLoading()
          Taro.showToast({ title: '上传失败', icon: 'none' })
        }
      } else {
        Taro.hideLoading()
        Taro.showToast({ title: '导出图片失败', icon: 'none' })
      }
    } catch (err) {
      Taro.hideLoading()
      console.error('Handwriting recognition error:', err)
      Taro.showToast({ title: '识别失败，请手动输入', icon: 'none' })
    }
  }

  // 加载状态
  if (phase === 'loading') {
    return (
      <View className="flex flex-col items-center justify-center h-screen bg-white">
        <Text className="block text-gray-500 text-lg">加载中...</Text>
      </View>
    )
  }

  // 完成状态
  if (phase === 'complete') {
    return (
      <View className="flex flex-col items-center justify-center h-screen bg-white px-6">
        <Check size={64} color="#22c55e" />
        <Text className="block text-2xl font-bold mt-4 mb-2">听写完成！</Text>
        <Text className="block text-gray-500 text-lg mb-6">
          正确 {correctCount} / {totalCount}
        </Text>
        <Progress value={(correctCount / totalCount) * 100} className="w-full mb-6" />
        <Button
          className="w-full bg-blue-500 text-white rounded-xl py-3"
          onClick={() => Taro.navigateBack()}
        >
          返回首页
        </Button>
      </View>
    )
  }

  // 手写板弹窗
  if (showCanvas) {
    return (
      <View className="flex flex-col h-screen bg-white">
        <View className="flex flex-row items-center justify-between px-4 py-3 border-b border-gray-200">
          <View className="flex flex-row items-center" onClick={() => { setShowCanvas(false); clearCanvas() }}>
            <ArrowLeft size={20} color="#666" />
            <Text className="block text-gray-600 ml-1">返回</Text>
          </View>
          <Text className="block text-lg font-semibold">手写输入</Text>
          <View className="flex flex-row gap-2">
            <Button size="sm" variant="outline" onClick={clearCanvas}>清除</Button>
            <Button size="sm" onClick={handleHandwritingSubmit}>确认</Button>
          </View>
        </View>
        <View
          className="flex-1 bg-gray-50 m-4 rounded-xl border border-gray-300 overflow-hidden"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <Canvas
            type="2d"
            id="handwritingCanvas"
            className="w-full h-full"
            disableScroll
          />
        </View>
      </View>
    )
  }

  return (
    <View className="flex flex-col h-screen bg-white">
      {/* 顶部导航 */}
      <View className="flex flex-row items-center justify-between px-4 py-3 border-b border-gray-200">
        <View className="flex flex-row items-center" onClick={() => Taro.navigateBack()}>
          <ArrowLeft size={20} color="#666" />
          <Text className="block text-gray-600 ml-1">返回</Text>
        </View>
        <Text className="block text-lg font-semibold">
          {vocabularyType === 'review' ? '复习听写' : '新单词听写'}
        </Text>
        <Badge variant="secondary">
          {currentIndex + 1}/{totalCount}
        </Badge>
      </View>

      {/* 进度条 */}
      <Progress value={((currentIndex + 1) / totalCount) * 100} className="mx-4 mt-3" />

      {/* 主内容区 */}
      <View className="flex-1 flex flex-col items-center justify-center px-6">
        {/* 单词显示 */}
        <View className="mb-8 text-center">
          {phase === 'playing' && (
            <>
              <Volume2 size={48} color="#3b82f6" className="mb-4" />
              <Text className="block text-gray-500 mb-2">正在朗读单词...</Text>
              <Text className="block text-3xl font-bold text-gray-800">{currentWord?.word}</Text>
            </>
          )}

          {(phase === 'spelling' || phase === 'meaning') && (
            <>
              <View className="flex flex-row items-center gap-2 mb-4">
                <Volume2
                  size={24}
                  color="#3b82f6"
                  onClick={() => playWord(currentWord?.word || '')}
                />
                <Text className="block text-gray-400 text-sm">点击重新播放</Text>
              </View>
              <Text className="block text-3xl font-bold text-gray-800 mb-6">{currentWord?.word}</Text>
            </>
          )}
        </View>

        {/* 拼写输入区 */}
        {phase === 'spelling' && (
          <View className="w-full">
            <Text className="block text-gray-500 text-sm mb-2">请输入英文拼写：</Text>
            <View className="flex flex-row gap-2">
              {/* Fix: 使用 @/components/ui/input */}
              <View className="flex-1">
                <Input
                  className="bg-gray-50 rounded-xl border-gray-200"
                  placeholder="输入英文单词..."
                  value={spellingInput}
                  onInput={(e) => setSpellingInput(e.detail.value)}
                  focus
                />
              </View>
              {/* Fix Bug 5: 手写输入按钮 */}
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowCanvas(true)}
              >
                <Pencil size={18} color="#666" />
              </Button>
            </View>
            <Button
              className="w-full bg-blue-500 text-white rounded-xl py-3 mt-4"
              onClick={handleSpellingSubmit}
              disabled={!spellingInput.trim()}
            >
              提交拼写
            </Button>
          </View>
        )}

        {/* 中文含义输入区 */}
        {phase === 'meaning' && (
          <View className="w-full">
            <Text className="block text-gray-500 text-sm mb-2">请说出中文含义：</Text>
            <View className="flex flex-row gap-3 justify-center mb-4">
              {/* Fix Bug 3: 录音按钮 */}
              <Button
                size="lg"
                className={`rounded-full w-16 h-16 flex items-center justify-center ${isRecording ? 'bg-red-500' : 'bg-blue-500'}`}
                onTouchStart={startRecording}
                onTouchEnd={stopRecording}
              >
                <Mic size={28} color="#fff" />
              </Button>
            </View>
            <Text className="block text-center text-gray-400 text-sm mb-4">
              {isRecording ? '正在录音...松手停止' : '按住录音，松手识别'}
            </Text>
            <View className="flex flex-row gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={handleDontKnow}
              >
                不知道
              </Button>
            </View>
          </View>
        )}

        {/* 反馈信息 */}
        {feedbackMsg && (
          <View className={`mt-6 px-4 py-3 rounded-xl w-full text-center ${
            spellingResult === 'correct' || meaningResult === 'correct'
              ? 'bg-green-50'
              : spellingResult === 'wrong' || meaningResult === 'wrong'
                ? 'bg-red-50'
                : 'bg-yellow-50'
          }`}
          >
            <Text className={`block text-base ${
              spellingResult === 'correct' || meaningResult === 'correct'
                ? 'text-green-600'
                : spellingResult === 'wrong' || meaningResult === 'wrong'
                  ? 'text-red-600'
                  : 'text-yellow-600'
            }`}
            >
              {feedbackMsg}
            </Text>
          </View>
        )}
      </View>

      {/* 底部操作栏 */}
      <View className="px-4 py-3 border-t border-gray-200">
        <View className="flex flex-row items-center justify-between">
          <Text className="block text-gray-400 text-sm">
            正确: {correctCount} / {currentIndex}
          </Text>
          <Text className="block text-gray-300 text-sm">
            {vocabularyType === 'review' ? '复习词库' : '新单词词库'}
          </Text>
        </View>
      </View>
    </View>
  )
}
