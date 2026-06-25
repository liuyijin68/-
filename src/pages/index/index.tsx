import { useState } from 'react'
import { View, Text } from '@tarojs/components'
import Taro, { useLoad, useDidShow } from '@tarojs/taro'
import { Network } from '@/network'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { BookOpen, Camera, Pencil, User, Coins, TrendingUp, LogOut, ChevronRight } from 'lucide-react-taro'

interface UserInfo {
  id: number
  username: string
  points: number
  masteredWords: number
  level: { princesses: number; girls: number; suns: number; moons: number; stars: number }
  created_at: string
}

export default function Index() {
  const [users, setUsers] = useState<UserInfo[]>([])
  const [currentUser, setCurrentUser] = useState<UserInfo | null>(null)
  const [showRegister, setShowRegister] = useState(false)
  const [newUsername, setNewUsername] = useState('')
  const [loading, setLoading] = useState(false)
  const [newWordsCount, setNewWordsCount] = useState(0)
  const [reviewWordsCount, setReviewWordsCount] = useState(0)

  const loadFromStorage = (key: string): any[] => {
    const raw = Taro.getStorageSync(key)
    if (!raw) return []
    try {
      return typeof raw === 'string' ? JSON.parse(raw) : raw
    } catch {
      return []
    }
  }

  const loadVocabularyStats = () => {
    const newWords = loadFromStorage('new_vocabulary')
    const reviewWords = loadFromStorage('review_vocabulary')
    setNewWordsCount(newWords.length)
    setReviewWordsCount(reviewWords.length)
  }

  // 从后端获取最新用户信息
  const fetchUserInfo = async (userId: number) => {
    try {
      const res = await Network.request({
        url: `/api/growth/user/${userId}`,
        method: 'GET',
      })
      const data = (res?.data as any)?.data
      if (data) {
        Taro.setStorageSync('current_user', data)
        setCurrentUser(data)
      }
    } catch (err) {
      console.error('获取用户信息失败:', err)
    }
  }

  const loadUsers = async () => {
    try {
      const res = await Network.request({
        url: '/api/growth/users',
        method: 'GET',
      })
      const data = (res?.data as any)?.data
      if (data && Array.isArray(data)) {
        setUsers(data)
      }
    } catch (err) {
      console.error('获取用户列表失败:', err)
    }
  }

  useLoad(() => {
    const cached = Taro.getStorageSync('current_user')
    if (cached) {
      setCurrentUser(cached)
    }
    loadUsers()
    loadVocabularyStats()
  })

  // Bug-1修复：每次页面显示时刷新用户信息
  useDidShow(() => {
    loadVocabularyStats()
    if (currentUser?.id) {
      fetchUserInfo(currentUser.id)
    }
    loadUsers()
  })

  const handleRegister = async () => {
    if (!newUsername.trim()) {
      Taro.showToast({ title: '请输入用户名', icon: 'none' })
      return
    }
    setLoading(true)
    try {
      const res = await Network.request({
        url: '/api/growth/register',
        method: 'POST',
        data: { username: newUsername.trim() },
      })
      const data = (res?.data as any)?.data
      if (data) {
        Taro.setStorageSync('current_user', data)
        setCurrentUser(data)
        setShowRegister(false)
        setNewUsername('')
        loadUsers()
        Taro.showToast({ title: '注册成功！', icon: 'success' })
      } else {
        Taro.showToast({ title: (res?.data as any)?.msg || '注册失败', icon: 'none' })
      }
    } catch (err) {
      Taro.showToast({ title: '网络错误', icon: 'none' })
    } finally {
      setLoading(false)
    }
  }

  const handleSelectUser = (user: UserInfo) => {
    Taro.setStorageSync('current_user', user)
    setCurrentUser(user)
  }

  const handleLogout = () => {
    Taro.removeStorageSync('current_user')
    setCurrentUser(null)
  }

  const renderLevel = (level: UserInfo['level']) => {
    const parts: string[] = []
    if (level.princesses > 0) parts.push(`${level.princesses}👸`)
    if (level.girls > 0) parts.push(`${level.girls}👧`)
    if (level.suns > 0) parts.push(`${level.suns}☀️`)
    if (level.moons > 0) parts.push(`${level.moons}🌙`)
    if (level.stars > 0 || parts.length === 0) parts.push(`${level.stars}⭐`)
    return parts.join(' ')
  }

  // 用户选择页面
  if (!currentUser) {
    return (
      <View className="flex flex-col h-full bg-gradient-to-b from-blue-50 to-white px-4 pt-12">
        <View className="text-center mb-8">
          <BookOpen size={48} color="#3b82f6" className="mx-auto mb-3" />
          <Text className="block text-2xl font-bold text-gray-800">小淘单词听写王</Text>
          <Text className="block text-sm text-gray-500 mt-1">选择你的账号开始学习</Text>
        </View>

        {users.length > 0 ? (
          <View className="flex flex-col gap-3 mb-6">
            {users.map(user => (
              <Card key={user.id} className="cursor-pointer active:opacity-80" onClick={() => handleSelectUser(user)}>
                <CardContent className="p-4 flex flex-row items-center justify-between">
                  <View className="flex flex-row items-center gap-3">
                    <View className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                      <User size={20} color="#3b82f6" />
                    </View>
                    <View>
                      <Text className="block font-semibold text-gray-800">{user.username}</Text>
                      <Text className="block text-xs text-gray-500">
                        {renderLevel(user.level)} · {user.points}积分
                      </Text>
                    </View>
                  </View>
                  <ChevronRight size={18} color="#9ca3af" />
                </CardContent>
              </Card>
            ))}
          </View>
        ) : (
          <View className="text-center py-8">
            <Text className="block text-gray-400 mb-4">还没有用户，快来注册吧！</Text>
          </View>
        )}

        <Button className="w-full bg-blue-500 text-white rounded-xl py-3" onClick={() => setShowRegister(true)}>
          注册新用户
        </Button>

        <Dialog open={showRegister} onOpenChange={setShowRegister}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>注册新用户</DialogTitle>
            </DialogHeader>
            <View className="flex flex-col gap-4 pt-2">
              <View className="bg-gray-50 rounded-xl px-4 py-3">
                <Input
                  className="w-full bg-transparent"
                  placeholder="请输入用户名"
                  value={newUsername}
                  onInput={(e) => setNewUsername(e.detail.value)}
                  maxlength={20}
                />
              </View>
              <Button
                className="w-full bg-blue-500 text-white rounded-xl py-3"
                onClick={handleRegister}
                disabled={loading}
              >
                {loading ? '注册中...' : '确认注册'}
              </Button>
            </View>
          </DialogContent>
        </Dialog>
      </View>
    )
  }

  // 已登录首页
  return (
    <View className="flex flex-col h-full bg-gradient-to-b from-blue-50 to-white">
      {/* 用户信息卡片 */}
      <View className="px-4 pt-8 pb-4">
        <Card>
          <CardContent className="p-5">
            <View className="flex flex-row items-center justify-between mb-3">
              <View className="flex flex-row items-center gap-3">
                <View className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
                  <User size={24} color="#3b82f6" />
                </View>
                <View>
                  <Text className="block text-lg font-bold text-gray-800">{currentUser.username}</Text>
                  <Text className="block text-xs text-gray-500">
                    掌握 {currentUser.masteredWords} 词
                  </Text>
                </View>
              </View>
              <View className="flex flex-row items-center gap-2">
                <Badge variant="secondary" className="flex flex-row items-center gap-1">
                  <Coins size={14} color="#f59e0b" />
                  <Text className="text-sm font-semibold text-amber-600">{currentUser.points}</Text>
                </Badge>
                <Button size="sm" variant="ghost" onClick={handleLogout}>
                  <LogOut size={16} color="#9ca3af" />
                </Button>
              </View>
            </View>

            {/* 等级展示 */}
            <View className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-xl p-3">
              <View className="flex flex-row items-center gap-2">
                <TrendingUp size={16} color="#f59e0b" />
                <Text className="block text-sm font-medium text-gray-700">
                  {renderLevel(currentUser.level)}
                </Text>
              </View>
            </View>
          </CardContent>
        </Card>
      </View>

      {/* 功能入口 */}
      <View className="flex-1 px-4">
        <Text className="block text-sm font-semibold text-gray-500 mb-3 px-1">学习功能</Text>

        <View className="grid grid-cols-2 gap-3 mb-4">
          {/* 新单词听写 */}
          <Card
            className="cursor-pointer active:opacity-80"
            onClick={() => {
              if (newWordsCount === 0) {
                Taro.showToast({ title: '新单词词库为空', icon: 'none' })
                return
              }
              Taro.navigateTo({ url: `/pages/dictation/index?type=new` })
            }}
          >
            <CardContent className="p-4 flex flex-col items-center gap-2">
              <View className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
                <Pencil size={24} color="#3b82f6" />
              </View>
              <Text className="block font-semibold text-gray-800">新单词听写</Text>
              <Badge variant="secondary">{newWordsCount} 词</Badge>
            </CardContent>
          </Card>

          {/* 复习听写 */}
          <Card
            className="cursor-pointer active:opacity-80"
            onClick={() => {
              if (reviewWordsCount === 0) {
                Taro.showToast({ title: '复习词库为空', icon: 'none' })
                return
              }
              Taro.navigateTo({ url: `/pages/dictation/index?type=review` })
            }}
          >
            <CardContent className="p-4 flex flex-col items-center gap-2">
              <View className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
                <BookOpen size={24} color="#22c55e" />
              </View>
              <Text className="block font-semibold text-gray-800">复习听写</Text>
              <Badge variant="secondary">{reviewWordsCount} 词</Badge>
            </CardContent>
          </Card>
        </View>

        <Separator className="my-3" />

        <Text className="block text-sm font-semibold text-gray-500 mb-3 px-1">更多功能</Text>

        <View className="flex flex-col gap-2">
          <Card className="cursor-pointer active:opacity-80" onClick={() => Taro.navigateTo({ url: '/pages/upload/index' })}>
            <CardContent className="p-4 flex flex-row items-center gap-3">
              <Camera size={20} color="#8b5cf6" />
              <View className="flex-1">
                <Text className="block font-medium text-gray-800">拍照识别单词</Text>
                <Text className="block text-xs text-gray-400">拍照上传，AI 自动识别单词</Text>
              </View>
              <ChevronRight size={16} color="#d1d5db" />
            </CardContent>
          </Card>

          <Card className="cursor-pointer active:opacity-80" onClick={() => Taro.navigateTo({ url: '/pages/vocabulary/index' })}>
            <CardContent className="p-4 flex flex-row items-center gap-3">
              <BookOpen size={20} color="#22c55e" />
              <View className="flex-1">
                <Text className="block font-medium text-gray-800">词库管理</Text>
                <Text className="block text-xs text-gray-400">手动增删单词，管理词库</Text>
              </View>
              <ChevronRight size={16} color="#d1d5db" />
            </CardContent>
          </Card>

          <Card className="cursor-pointer active:opacity-80" onClick={() => Taro.navigateTo({ url: '/pages/profile/index' })}>
            <CardContent className="p-4 flex flex-row items-center gap-3">
              <User size={20} color="#3b82f6" />
              <View className="flex-1">
                <Text className="block font-medium text-gray-800">个人中心</Text>
                <Text className="block text-xs text-gray-400">查看等级、积分详情</Text>
              </View>
              <ChevronRight size={16} color="#d1d5db" />
            </CardContent>
          </Card>

          <Card className="cursor-pointer active:opacity-80" onClick={() => Taro.navigateTo({ url: '/pages/points/index' })}>
            <CardContent className="p-4 flex flex-row items-center gap-3">
              <Coins size={20} color="#f59e0b" />
              <View className="flex-1">
                <Text className="block font-medium text-gray-800">积分管理</Text>
                <Text className="block text-xs text-gray-400">积分兑换、明细查询</Text>
              </View>
              <ChevronRight size={16} color="#d1d5db" />
            </CardContent>
          </Card>
        </View>
      </View>
    </View>
  )
}
