import { useState } from 'react'
import { View, Text } from '@tarojs/components'
import Taro, { useLoad } from '@tarojs/taro'
import { Network } from '@/network'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Sun, Moon, Star, User, BookOpen, Upload, ChevronRight, LogOut, Plus } from 'lucide-react-taro'

interface UserInfo {
  id: number
  username: string
  points: number
  masteredWords: number
  level: { suns: number; moons: number; stars: number }
  created_at: string
}

const CURRENT_USER_KEY = 'current_user'

export default function IndexPage() {
  const [users, setUsers] = useState<UserInfo[]>([])
  const [currentUser, setCurrentUser] = useState<UserInfo | null>(null)
  const [showRegister, setShowRegister] = useState(false)
  const [newUsername, setNewUsername] = useState('')
  const [loading, setLoading] = useState(false)

  // 加载用户列表
  const loadUsers = async () => {
    try {
      const res = await Network.request({ url: '/api/growth/users' })
      const data = (res?.data as any)?.data
      if (Array.isArray(data)) {
        setUsers(data)
      }
    } catch (err) {
      console.error('加载用户列表失败:', err)
    }
  }

  // 加载当前用户
  const loadCurrentUser = async () => {
    try {
      const stored = Taro.getStorageSync(CURRENT_USER_KEY)
      if (stored) {
        const parsed = typeof stored === 'string' ? JSON.parse(stored) : stored
        const res = await Network.request({ url: `/api/growth/user/${parsed.id}` })
        const data = (res?.data as any)?.data
        if (data) {
          setCurrentUser(data)
          Taro.setStorageSync(CURRENT_USER_KEY, JSON.stringify(data))
        }
      }
    } catch (err) {
      console.error('加载当前用户失败:', err)
    }
  }

  useLoad(() => {
    loadUsers()
    loadCurrentUser()
  })

  // 选择用户
  const handleSelectUser = async (user: UserInfo) => {
    setCurrentUser(user)
    Taro.setStorageSync(CURRENT_USER_KEY, JSON.stringify(user))
  }

  // 退出用户
  const handleLogout = () => {
    setCurrentUser(null)
    Taro.removeStorageSync(CURRENT_USER_KEY)
  }

  // 注册新用户
  const handleRegister = async () => {
    const trimmed = newUsername.trim()
    if (!trimmed) {
      Taro.showToast({ title: '请输入用户名', icon: 'none' })
      return
    }
    setLoading(true)
    try {
      const res = await Network.request({
        url: '/api/growth/register',
        method: 'POST',
        data: { username: trimmed },
      })
      const data = (res?.data as any)?.data
      if (data) {
        Taro.showToast({ title: '注册成功', icon: 'success' })
        setCurrentUser(data)
        Taro.setStorageSync(CURRENT_USER_KEY, JSON.stringify(data))
        setNewUsername('')
        setShowRegister(false)
        loadUsers()
      } else {
        Taro.showToast({ title: (res?.data as any)?.msg || '注册失败', icon: 'none' })
      }
    } catch (err) {
      Taro.showToast({ title: '注册失败，请重试', icon: 'none' })
    } finally {
      setLoading(false)
    }
  }

  // 渲染等级图标
  const renderLevel = (level: { suns: number; moons: number; stars: number }) => {
    const icons: JSX.Element[] = []
    for (let i = 0; i < level.suns; i++) {
      icons.push(<Sun key={`sun-${i}`} size={18} color="#f59e0b" />)
    }
    for (let i = 0; i < level.moons; i++) {
      icons.push(<Moon key={`moon-${i}`} size={18} color="#6366f1" />)
    }
    for (let i = 0; i < level.stars; i++) {
      icons.push(<Star key={`star-${i}`} size={18} color="#f59e0b" />)
    }
    if (icons.length === 0) {
      icons.push(<Star key="empty" size={18} color="#d1d5db" />)
    }
    return <View className="flex flex-row items-center gap-1">{icons}</View>
  }

  // 进入听写
  const startDictation = (type: 'new' | 'review') => {
    Taro.navigateTo({ url: `/pages/dictation/index?type=${type}` })
  }

  // ====== 未选择用户：显示用户列表 + 注册入口 ======
  if (!currentUser) {
    return (
      <View className="flex flex-col min-h-screen bg-gray-50">
        {/* 顶部 */}
        <View className="bg-white px-4 pt-12 pb-6">
          <Text className="block text-2xl font-bold text-gray-800 mb-1">小淘单词听写王</Text>
          <Text className="block text-gray-400 text-sm">选择或创建你的养成账号</Text>
        </View>

        {/* 用户列表 */}
        <View className="flex-1 px-4 pt-4">
          <Text className="block text-sm text-gray-500 mb-3">已有账号</Text>
          {users.length === 0 ? (
            <View className="flex flex-col items-center justify-center py-12">
              <User size={48} color="#d1d5db" />
              <Text className="block text-gray-400 mt-3">还没有账号，快去注册吧</Text>
            </View>
          ) : (
            <View className="flex flex-col gap-3">
              {users.map((user) => (
                <Card key={user.id} className="cursor-pointer" onClick={() => handleSelectUser(user)}>
                  <CardContent className="p-4">
                    <View className="flex flex-row items-center justify-between">
                      <View className="flex flex-row items-center gap-3">
                        <View className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                          <User size={20} color="#3b82f6" />
                        </View>
                        <View>
                          <Text className="block text-base font-semibold text-gray-800">{user.username}</Text>
                          <View className="flex flex-row items-center gap-2 mt-1">
                            {renderLevel(user.level)}
                            <Text className="block text-xs text-gray-400">{user.points}积分</Text>
                          </View>
                        </View>
                      </View>
                      <ChevronRight size={18} color="#d1d5db" />
                    </View>
                  </CardContent>
                </Card>
              ))}
            </View>
          )}

          {/* 注册新用户 */}
          {!showRegister ? (
            <Button
              className="w-full mt-4 bg-blue-500 text-white rounded-xl py-3"
              onClick={() => setShowRegister(true)}
            >
              <Plus size={18} color="#fff" />
              <Text className="block text-white ml-1">注册新账号</Text>
            </Button>
          ) : (
            <Card className="mt-4">
              <CardContent className="p-4">
                <Text className="block text-sm font-semibold text-gray-700 mb-3">创建新账号</Text>
                <View className="mb-3">
                  <Input
                    className="bg-gray-50 rounded-xl border-gray-200"
                    placeholder="输入用户名（1-50字符）"
                    value={newUsername}
                    onInput={(e) => setNewUsername(e.detail.value)}
                    maxlength={50}
                  />
                </View>
                <View className="flex flex-row gap-2">
                  <Button
                    className="flex-1 bg-gray-200 text-gray-600 rounded-xl py-2"
                    onClick={() => { setShowRegister(false); setNewUsername('') }}
                  >
                    取消
                  </Button>
                  <Button
                    className="flex-1 bg-blue-500 text-white rounded-xl py-2"
                    onClick={handleRegister}
                    disabled={loading || !newUsername.trim()}
                  >
                    {loading ? '注册中...' : '确认注册'}
                  </Button>
                </View>
              </CardContent>
            </Card>
          )}
        </View>
      </View>
    )
  }

  // ====== 已选择用户：显示功能入口 ======
  return (
    <View className="flex flex-col min-h-screen bg-gray-50">
      {/* 用户信息卡片 */}
      <View className="bg-white px-4 pt-12 pb-4">
        <View className="flex flex-row items-center justify-between mb-3">
          <View className="flex flex-row items-center gap-3">
            <View className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
              <User size={24} color="#3b82f6" />
            </View>
            <View>
              <Text className="block text-lg font-bold text-gray-800">{currentUser.username}</Text>
              <View className="flex flex-row items-center gap-1 mt-1">
                {renderLevel(currentUser.level)}
              </View>
            </View>
          </View>
          <View className="flex flex-row items-center gap-2">
            <Badge variant="secondary" className="text-sm">
              {currentUser.points} 积分
            </Badge>
            <View onClick={handleLogout} className="cursor-pointer">
              <LogOut size={18} color="#9ca3af" />
            </View>
          </View>
        </View>

        {/* 快捷入口：个人中心 & 积分管理 */}
        <View className="flex flex-row gap-2 mt-2">
          <Button
            className="flex-1 bg-blue-50 text-blue-600 rounded-xl py-2 text-sm"
            variant="ghost"
            onClick={() => Taro.navigateTo({ url: '/pages/profile/index' })}
          >
            个人中心
          </Button>
          <Button
            className="flex-1 bg-amber-50 text-amber-600 rounded-xl py-2 text-sm"
            variant="ghost"
            onClick={() => Taro.navigateTo({ url: '/pages/points/index' })}
          >
            积分管理
          </Button>
        </View>
      </View>

      {/* 功能入口 */}
      <View className="flex-1 px-4 pt-4">
        <Text className="block text-sm text-gray-500 mb-3">开始学习</Text>

        <View className="flex flex-col gap-3">
          {/* 新单词听写 */}
          <Card className="cursor-pointer" onClick={() => startDictation('new')}>
            <CardContent className="p-4">
              <View className="flex flex-row items-center gap-3">
                <View className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center">
                  <BookOpen size={20} color="#22c55e" />
                </View>
                <View className="flex-1">
                  <Text className="block text-base font-semibold text-gray-800">新单词听写</Text>
                  <Text className="block text-xs text-gray-400 mt-1">使用新单词词库进行听写练习</Text>
                </View>
                <ChevronRight size={18} color="#d1d5db" />
              </View>
            </CardContent>
          </Card>

          {/* 复习听写 */}
          <Card className="cursor-pointer" onClick={() => startDictation('review')}>
            <CardContent className="p-4">
              <View className="flex flex-row items-center gap-3">
                <View className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center">
                  <BookOpen size={20} color="#f97316" />
                </View>
                <View className="flex-1">
                  <Text className="block text-base font-semibold text-gray-800">复习听写</Text>
                  <Text className="block text-xs text-gray-400 mt-1">复习之前答错或不认识的单词</Text>
                </View>
                <ChevronRight size={18} color="#d1d5db" />
              </View>
            </CardContent>
          </Card>

          {/* 上传识别 */}
          <Card className="cursor-pointer" onClick={() => Taro.navigateTo({ url: '/pages/upload/index' })}>
            <CardContent className="p-4">
              <View className="flex flex-row items-center gap-3">
                <View className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center">
                  <Upload size={20} color="#a855f7" />
                </View>
                <View className="flex-1">
                  <Text className="block text-base font-semibold text-gray-800">拍照识别单词</Text>
                  <Text className="block text-xs text-gray-400 mt-1">拍照上传单词表，自动识别单词和含义</Text>
                </View>
                <ChevronRight size={18} color="#d1d5db" />
              </View>
            </CardContent>
          </Card>

          {/* 词库管理 */}
          <Card className="cursor-pointer" onClick={() => Taro.navigateTo({ url: '/pages/vocabulary/index' })}>
            <CardContent className="p-4">
              <View className="flex flex-row items-center gap-3">
                <View className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center">
                  <BookOpen size={20} color="#6b7280" />
                </View>
                <View className="flex-1">
                  <Text className="block text-base font-semibold text-gray-800">词库管理</Text>
                  <Text className="block text-xs text-gray-400 mt-1">手动添加、编辑或删除单词</Text>
                </View>
                <ChevronRight size={18} color="#d1d5db" />
              </View>
            </CardContent>
          </Card>
        </View>
      </View>
    </View>
  )
}
