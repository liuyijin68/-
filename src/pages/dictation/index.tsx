import { useState, useEffect, useCallback, useRef } from 'react'
import { View, Text, Canvas } from '@tarojs/components'
import { Input } from '@/components/ui/input'
import Taro, { useLoad } from '@tarojs/taro'
import { Network } from '@/network'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Progress } from '@/components/ui/progress'
import { Volume2, Pencil, ArrowLeft, Check, X, Star, Coins } from 'lucide-react-taro'

interface WordItem {
  word: string
  meanings: string[]
  date: string
}

const loadWordsFromStorage = (key: string): WordItem[] => {
  const raw = Taro.getStorageSync(key)
  if (!raw) return []
  try {
    return typeof raw === 'string' ? JSON.parse(raw) : raw
  } catch {
    return []
  }
}

export default function Dictation() {
  const [wordList, setWordList] = useState<WordItem[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [phase, setPhase] = useState<'loading' | 'countSelect' | 'playing' | 'spelling' | 'meaning' | 'correct' | 'wrong' | 'finished'>('loading')
  const [spellingInput, setSpellingInput] = useState('')
  const [meaningInput, setMeaningInput] = useState('')
  const [showCanvas, setShowCanvas] = useState(false)
  const [totalCount, setTotalCount] = useState(0)
  const [correctCount, setCorrectCount] = useState(0)
  const [upgradeBonus, setUpgradeBonus] = useState<{ points: number; level: string } | null>(null)
  const [dictateCount, setDictateCount] = useState(10)
  const canvasRef = useRef<any>(null)
  const ctxRef = useRef<any>(null)
  const isDrawingRef = useRef(false)
  const lastPosRef = useRef({ x: 0, y: 0 })

  const currentWord = wordList[currentIndex] || null

  useLoad((options) => {
    const params = options as any
    const key = params?.type === 'review' ? 'review_vocabulary' : 'new_vocabulary'
    const words = loadWordsFromStorage(key)
    if (words.length > 0) {
      setWordList(words)
      if (words.length > 10) {
        setPhase('countSelect')
        setTotalCount(words.length)
      } else {
        setTotalCount(words.length)
        setPhase('playing')
      }
    } else {
      Taro.showToast({ title: '词库为空，请先添加单词', icon: 'none' })
      setTimeout(() => Taro.navigateBack(), 1500)
    }
  })

  // Canvas 初始化
  useEffect(() => {
    if (showCanvas) {
      setTimeout(() => {
        const query = Taro.createSelectorQuery()
        query.select('#handwritingCanvas').fields({ node: true, size: true }).exec((res) => {
          if (res[0]?.node) {
            const canvas = res[0].node
            const ctx = canvas.getContext('2d')
            const dpr = Taro.getSystemInfoSync().pixelRatio
            canvas.width = res[0].width * dpr
            canvas.height = res[0].height * dpr
            ctx.scale(dpr, dpr)
            ctx.lineWidth = 3
            ctx.lineCap = 'round'
            ctx.lineJoin = 'round'
            ctx.strokeStyle = '#333'
            canvasRef.current = canvas
            ctxRef.current = ctx
          }
        })
      }, 300)
    }
  }, [showCanvas])

  const handleTouchStart = (e: any) => {
    if (!ctxRef.current) return
    isDrawingRef.current = true
    const touch = e.touches[0]
    lastPosRef.current = { x: touch.x, y: touch.y }
    ctxRef.current.beginPath()
    ctxRef.current.moveTo(touch.x, touch.y)
  }

  const handleTouchMove = (e: any) => {
    if (!isDrawingRef.current || !ctxRef.current) return
    const touch = e.touches[0]
    ctxRef.current.lineTo(touch.x, touch.y)
    ctxRef.current.stroke()
    lastPosRef.current = { x: touch.x, y: touch.y }
  }

  const handleTouchEnd = () => {
    isDrawingRef.current = false
  }

  const handleClearCanvas = () => {
    if (!canvasRef.current || !ctxRef.current) return
    const canvas = canvasRef.current
    ctxRef.current.clearRect(0, 0, canvas.width, canvas.height)
  }

  const handleHandwritingSubmit = async () => {
    if (!canvasRef.current) return
    try {
      Taro.showLoading({ title: '识别中...' })
      const canvas = canvasRef.current
      const tempFilePath = await new Promise<string>((resolve, reject) => {
        canvas.toTempFilePath({
          success: (res: any) => resolve(res.tempFilePath),
          fail: reject,
        })
      })
      const uploadRes = await Network.uploadFile({
        url: '/api/dictation/upload-image',
        filePath: tempFilePath,
        name: 'file',
      })
      const uploadData = JSON.parse(uploadRes.data)
      const imgUrl = uploadData?.data?.imageUrl
      if (!imgUrl) {
        Taro.hideLoading()
        Taro.showToast({ title: '上传失败', icon: 'none' })
        return
      }
      const hwRes = await Network.request({
        url: '/api/dictation/recognize-handwriting',
        method: 'POST',
        data: { imageUrl: imgUrl },
      })
      Taro.hideLoading()
      const hwData = (hwRes?.data as any)?.data
      if (hwData?.text) {
        if (phase === 'spelling') {
          setSpellingInput(hwData.text.trim())
        } else if (phase === 'meaning') {
          setMeaningInput(hwData.text.trim())
        }
        setShowCanvas(false)
        handleClearCanvas()
      } else {
        Taro.showToast({ title: '无法识别手写内容', icon: 'none' })
      }
    } catch (err) {
      Taro.hideLoading()
      Taro.showToast({ title: '识别失败', icon: 'none' })
    }
  }

  function playAudioUrl(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!url) {
        console.error('[playAudioUrl] 音频地址为空')
        reject(new Error('音频地址为空'))
        return
      }
      console.log('[playAudioUrl] 开始播放:', url)
      const audioCtx = Taro.createInnerAudioContext()
      audioCtx.src = url
      audioCtx.autoplay = true

      audioCtx.onPlay(() => {
        console.log('[playAudioUrl] 播放中')
      })
      audioCtx.onEnded(() => {
        console.log('[playAudioUrl] 播放结束')
        audioCtx.destroy()
        resolve()
      })
      audioCtx.onError((err: any) => {
        console.error('[playAudioUrl] 播放错误:', JSON.stringify(err))
        Taro.showToast({ title: '播放失败，错误码: ' + (err?.errCode || '未知'), icon: 'none' })
        audioCtx.destroy()
        reject(err)
      })
      const timeout = setTimeout(() => {
        console.error('[playAudioUrl] 播放超时')
        audioCtx.destroy()
        reject(new Error('播放超时'))
      }, 15000)
      audioCtx.onPlay(() => clearTimeout(timeout))
      audioCtx.onEnded(() => clearTimeout(timeout))
    })
  }

  const playWord = useCallback(async (word: string) => {
    try {
      console.log('[playWord] 请求发音:', word)
      const res = await Network.request({
        url: '/api/dictation/speak-word-both',
        method: 'POST',
        data: { word },
        timeout: 15000,
      })
      console.log('[playWord] 响应:', res)
      const innerData = (res?.data as any)?.data
      if (innerData?.usAudioUrl) {
        await playAudioUrl(innerData.usAudioUrl).catch(e => console.warn('美式发音失败', e))
      }
      if (innerData?.ukAudioUrl && innerData.ukAudioUrl !== innerData.usAudioUrl) {
        await playAudioUrl(innerData.ukAudioUrl).catch(e => console.warn('英式发音失败', e))
      }
    } catch (err: any) {
      console.error('[playWord] 完整错误:', err)
      if (err?.errMsg?.includes('request:fail')) {
        Taro.showToast({ title: '请求失败，请检查后端地址配置', icon: 'none', duration: 3000 })
      } else {
        Taro.showToast({ title: '发音获取失败: ' + (err?.message || '未知错误'), icon: 'none' })
      }
      setPhase('spelling')
    }
  }, [])

  // 用户点击"开始听写"按钮触发（满足小程序手势要求）
  const handleStartDictation = () => {
    setPhase('playing')
    if (currentWord) {
      playWord(currentWord.word)
    }
  }

  // 播放阶段结束，进入拼写
  useEffect(() => {
    if (phase === 'playing' && currentWord) {
      const timer = setTimeout(() => {
        setPhase('spelling')
      }, 3000)
      return () => clearTimeout(timer)
    }
  }, [phase, currentWord])

  const checkMeaning = (meanings: string[], input: string): boolean => {
    if (!meanings || meanings.length === 0) return false
    const normalized = input.trim().toLowerCase().replace(/[，,。.、；;：:！!？?]/g, '')
    return meanings.some(m => {
      const normM = m.trim().toLowerCase().replace(/[，,。.、；;：:！!？?]/g, '')
      return normM.includes(normalized) || normalized.includes(normM)
    })
  }

  // 从词库删除已掌握的单词
  const removeFromBank = async (word: string, bank: 'new' | 'review') => {
    try {
      await Network.request({
        url: '/api/dictation/remove-from-bank',
        method: 'POST',
        data: { word, bank },
      })
      // 同步更新本地存储
      const key = bank === 'new' ? 'new_vocabulary' : 'review_vocabulary'
      const current = loadWordsFromStorage(key)
      const updated = current.filter(w => w.word !== word)
      Taro.setStorageSync(key, JSON.stringify(updated))
      console.log('[removeFromBank] removed', word, 'from', bank)
    } catch (err) {
      console.error('[removeFromBank] error:', err)
    }
  }

  // 发放积分并检查升级奖励
  const awardPoints = async (word: string) => {
    try {
      const cached = Taro.getStorageSync('current_user')
      if (!cached?.id) return
      const res = await Network.request({
        url: '/api/growth/earn',
        method: 'POST',
        data: { userId: cached.id, word },
      })
      const data = (res?.data as any)?.data
      if (data) {
        // 更新缓存
        const updated = { ...cached, points: data.points, masteredWords: data.masteredWords, level: data.level }
        Taro.setStorageSync('current_user', updated)
        // 检查升级奖励
        if (data.upgradeBonus && data.upgradeBonus > 0) {
          setUpgradeBonus({ points: data.upgradeBonus, level: data.upgradeLevel || '' })
        }
      }
    } catch (err) {
      console.error('[awardPoints] error:', err)
    }
  }

  const handleSpellingSubmit = () => {
    if (!currentWord) return
    const trimmed = spellingInput.trim()
    if (!trimmed) {
      Taro.showToast({ title: '请输入英文拼写', icon: 'none' })
      return
    }
    if (trimmed.toLowerCase() === currentWord.word.toLowerCase()) {
      setPhase('meaning')
      setSpellingInput('')
    } else {
      setPhase('wrong')
    }
  }

  const handleMeaningSubmit = () => {
    if (!currentWord) return
    const trimmed = meaningInput.trim()
    if (!trimmed) {
      Taro.showToast({ title: '请输入中文含义', icon: 'none' })
      return
    }
    if (checkMeaning(currentWord.meanings, trimmed)) {
      handleMeaningCorrect()
    } else {
      handleMeaningWrong()
    }
    setMeaningInput('')
  }

  const handleMeaningCorrect = () => {
    if (!currentWord) return
    // 拼写和含义都正确 → 从词库删除
    const params = Taro.getCurrentInstance().router?.params as any
    const bank = params?.type === 'review' ? 'review' : 'new'
    removeFromBank(currentWord.word, bank)
    // 发放积分
    awardPoints(currentWord.word)
    setCorrectCount(prev => prev + 1)
    setPhase('correct')
  }

  const handleMeaningWrong = () => {
    setPhase('wrong')
  }

  const handleDontKnow = () => {
    if (!currentWord) return
    // 加入复习词库
    const reviewList = loadWordsFromStorage('review_vocabulary')
    if (!reviewList.some(w => w.word === currentWord.word)) {
      reviewList.push({ ...currentWord, date: new Date().toISOString().split('T')[0] })
      Taro.setStorageSync('review_vocabulary', JSON.stringify(reviewList))
    }
    // 从当前词库删除
    const params = Taro.getCurrentInstance().router?.params as any
    const bank = params?.type === 'review' ? 'review' : 'new'
    const key = bank === 'new' ? 'new_vocabulary' : 'review_vocabulary'
    const current = loadWordsFromStorage(key)
    const updated = current.filter(w => w.word !== currentWord.word)
    Taro.setStorageSync(key, JSON.stringify(updated))
    setPhase('wrong')
  }

  const handleNext = () => {
    setSpellingInput('')
    setMeaningInput('')
    if (currentIndex + 1 >= wordList.length) {
      setPhase('finished')
    } else {
      setCurrentIndex(prev => prev + 1)
      setPhase('playing')
      const nextWord = wordList[currentIndex + 1]
      if (nextWord) {
        playWord(nextWord.word)
      }
    }
  }

  const handleReplay = () => {
    if (currentWord) {
      playWord(currentWord.word)
    }
  }

  const handleStartCount = () => {
    if (dictateCount < 1 || dictateCount > wordList.length) {
      Taro.showToast({ title: `请输入1-${wordList.length}之间的数字`, icon: 'none' })
      return
    }
    const selected = wordList.slice(0, dictateCount)
    setWordList(selected)
    setTotalCount(dictateCount)
    setPhase('playing')
    if (selected[0]) {
      playWord(selected[0].word)
    }
  }

  const progress = totalCount > 0 ? ((currentIndex + (phase === 'correct' || phase === 'wrong' ? 1 : 0)) / totalCount) * 100 : 0

  return (
    <View className="flex flex-col h-full bg-gray-50">
      {/* 顶部导航 */}
      <View className="bg-white px-4 py-3 flex flex-row items-center gap-3 border-b border-gray-100">
        <Button variant="ghost" size="sm" onClick={() => Taro.navigateBack()}>
          <ArrowLeft size={20} color="#666" />
        </Button>
        <View className="flex-1">
          <Text className="block text-lg font-semibold text-gray-800">单词听写</Text>
        </View>
        <Badge variant="secondary">
          {currentIndex + 1}/{totalCount}
        </Badge>
      </View>

      {/* 进度条 */}
      <Progress value={progress} className="h-1 rounded-none" />

      {/* 主内容区 */}
      <View className="flex-1 flex flex-col items-center justify-center px-6">
        {/* 数量选择 */}
        {phase === 'countSelect' && (
          <Card className="w-full">
            <CardContent className="p-6 flex flex-col items-center gap-4">
              <Text className="block text-lg font-semibold text-gray-800">
                词库共 {wordList.length} 个单词
              </Text>
              <Text className="block text-sm text-gray-500">请输入本次要听写的单词数量：</Text>
              <View className="bg-gray-50 rounded-xl px-4 py-3 w-32">
                <Input
                  className="w-full bg-transparent text-center text-xl font-bold"
                  type="number"
                  value={String(dictateCount)}
                  onInput={(e) => setDictateCount(Number(e.detail.value) || 0)}
                  maxlength={4}
                />
              </View>
              <Button className="w-full bg-blue-500 text-white rounded-xl py-3" onClick={handleStartCount}>
                开始听写
              </Button>
            </CardContent>
          </Card>
        )}

        {/* 开始听写按钮（用户手势触发） */}
        {phase === 'loading' && wordList.length > 0 && wordList.length <= 10 && (
          <View className="flex flex-col items-center gap-6">
            <Volume2 size={48} color="#3b82f6" />
            <Text className="block text-gray-600 text-center">
              共 {wordList.length} 个单词待听写
            </Text>
            <Button className="bg-blue-500 text-white rounded-xl px-8 py-4 text-lg" onClick={handleStartDictation}>
              开始听写
            </Button>
          </View>
        )}

        {/* 播放阶段 */}
        {phase === 'playing' && (
          <View className="flex flex-col items-center gap-4">
            <Volume2 size={48} color="#3b82f6" className="mb-2" />
            <Text className="block text-gray-500 mb-2">正在朗读单词，请仔细听...</Text>
            <Button variant="outline" onClick={handleReplay}>
              <Volume2 size={16} color="#3b82f6" />
              <Text className="text-blue-500 ml-1">点击重新播放</Text>
            </Button>
          </View>
        )}

        {/* 拼写阶段 */}
        {phase === 'spelling' && (
          <View className="w-full">
            <Text className="block text-gray-500 text-sm mb-2">请输入英文拼写：</Text>
            <View className="flex flex-row gap-2">
              <View className="flex-1">
                <Input
                  className="bg-gray-50 rounded-xl border-gray-200"
                  placeholder="输入英文拼写..."
                  value={spellingInput}
                  onInput={(e) => setSpellingInput(e.detail.value)}
                  focus
                />
              </View>
              <Button size="sm" variant="outline" onClick={() => setShowCanvas(true)}>
                <Pencil size={18} color="#666" />
              </Button>
            </View>
            <View className="flex flex-row gap-2 mt-4">
              <Button className="flex-1 bg-blue-500 text-white rounded-xl py-3" onClick={handleSpellingSubmit} disabled={!spellingInput.trim()}>
                提交拼写
              </Button>
              <Button className="flex-1 bg-gray-300 text-gray-700 rounded-xl py-3" onClick={handleDontKnow}>
                不知道
              </Button>
            </View>
          </View>
        )}

        {/* 含义阶段 */}
        {phase === 'meaning' && (
          <View className="w-full">
            <Text className="block text-gray-500 text-sm mb-2">请输入中文含义：</Text>
            <View className="flex flex-row gap-2">
              <View className="flex-1">
                <Input
                  className="bg-gray-50 rounded-xl border-gray-200"
                  placeholder="输入中文含义..."
                  value={meaningInput}
                  onInput={(e) => setMeaningInput(e.detail.value)}
                  focus
                />
              </View>
              <Button size="sm" variant="outline" onClick={() => setShowCanvas(true)}>
                <Pencil size={18} color="#666" />
              </Button>
            </View>
            <View className="flex flex-row gap-2 mt-4">
              <Button className="flex-1 bg-blue-500 text-white rounded-xl py-3" onClick={handleMeaningSubmit} disabled={!meaningInput.trim()}>
                提交含义
              </Button>
              <Button className="flex-1 bg-gray-300 text-gray-700 rounded-xl py-3" onClick={handleDontKnow}>
                不知道
              </Button>
            </View>
          </View>
        )}

        {/* 答对 */}
        {phase === 'correct' && (
          <View className="flex flex-col items-center gap-4">
            <View className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center">
              <Check size={40} color="#22c55e" />
            </View>
            <Text className="block text-xl font-bold text-green-600">回答正确！</Text>
            <Card className="w-full">
              <CardContent className="p-4">
                <Text className="block font-semibold text-gray-800 text-center">{currentWord?.word}</Text>
                <Text className="block text-sm text-gray-500 text-center mt-1">
                  {currentWord?.meanings?.join('；') || ''}
                </Text>
              </CardContent>
            </Card>
            <Button className="w-full bg-blue-500 text-white rounded-xl py-3" onClick={handleNext}>
              {currentIndex + 1 >= wordList.length ? '完成' : '下一个'}
            </Button>
          </View>
        )}

        {/* 答错 */}
        {phase === 'wrong' && (
          <View className="flex flex-col items-center gap-4">
            <View className="w-20 h-20 rounded-full bg-red-100 flex items-center justify-center">
              <X size={40} color="#ef4444" />
            </View>
            <Text className="block text-xl font-bold text-red-500">回答错误</Text>
            <Card className="w-full">
              <CardContent className="p-4">
                <Text className="block font-semibold text-gray-800 text-center">{currentWord?.word}</Text>
                <Text className="block text-sm text-gray-500 text-center mt-1">
                  {currentWord?.meanings?.join('；') || ''}
                </Text>
              </CardContent>
            </Card>
            <Text className="block text-xs text-gray-400">已加入复习词库</Text>
            <Button className="w-full bg-blue-500 text-white rounded-xl py-3" onClick={handleNext}>
              {currentIndex + 1 >= wordList.length ? '完成' : '下一个'}
            </Button>
          </View>
        )}

        {/* 完成 */}
        {phase === 'finished' && (
          <View className="flex flex-col items-center gap-4">
            <Star size={48} color="#f59e0b" />
            <Text className="block text-2xl font-bold text-gray-800">听写完成！</Text>
            <Text className="block text-gray-500">
              正确 {correctCount} / {totalCount} 个单词
            </Text>
            <Button className="w-full bg-blue-500 text-white rounded-xl py-3" onClick={() => Taro.navigateBack()}>
              返回首页
            </Button>
          </View>
        )}
      </View>

      {/* 升级奖励弹窗 */}
      <Dialog open={!!upgradeBonus} onOpenChange={() => setUpgradeBonus(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>🎉 恭喜升级！</DialogTitle>
          </DialogHeader>
          <View className="flex flex-col items-center gap-3 py-4">
            <Text className="block text-3xl">{upgradeBonus?.level}</Text>
            <Text className="block text-lg font-bold text-amber-600">
              获得 {upgradeBonus?.points} 积分奖励！
            </Text>
            <View className="flex flex-row items-center gap-1">
              <Coins size={20} color="#f59e0b" />
              <Text className="text-sm text-gray-500">积分已自动发放到你的账户</Text>
            </View>
          </View>
        </DialogContent>
      </Dialog>

      {/* Canvas 手写弹窗 */}
      <Dialog open={showCanvas} onOpenChange={setShowCanvas}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>手写输入</DialogTitle>
          </DialogHeader>
          <View className="flex flex-col gap-3">
            <View className="bg-gray-100 rounded-xl overflow-hidden" style={{ height: '200px' }}>
              <Canvas
                id="handwritingCanvas"
                type="2d"
                className="w-full h-full"
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
              />
            </View>
            <View className="flex flex-row gap-2">
              <Button variant="outline" className="flex-1" onClick={handleClearCanvas}>清除</Button>
              <Button className="flex-1 bg-blue-500 text-white rounded-xl" onClick={handleHandwritingSubmit}>识别</Button>
            </View>
          </View>
        </DialogContent>
      </Dialog>
    </View>
  )
}
