import { useState } from 'react'
import { View, Text } from '@tarojs/components'
import Taro, { useLoad } from '@tarojs/taro'
import { Network } from '@/network'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Sun, Moon, Star, User, ArrowLeft, TrendingUp, Award } from 'lucide-react-taro'

interface UserInfo {
  id: number
  username: string
  points: number
  masteredWords: number
  level: { suns: number; moons: number; stars: number }
  created_at: string
}

const CURRENT_USER_KEY = 'current_user'

export default function ProfilePage() {
  const [user, setUser] = useState<UserInfo | null>(null)
  const [stats, setStats] = useState<{ totalEarned: number; totalSpent: number; balance: number } | null>(null)

  const loadData = async () => {
    try {
      const stored = Taro.getStorageSync(CURRENT_USER_KEY)
      if (!stored) {
        Taro.showToast({ title: '请先选择用户', icon: 'none' })
        setTimeout(() => Taro.navigateBack(), 1000)
        return
      }
      const parsed = typeof stored === 'string' ? JSON.parse(stored) : stored
      const res = await Network.request({ url: `/api/growth/user/${parsed.id}` })
      const data = (res?.data as any)?.data
      if (data) {
        setUser(data)
        Taro.setStorageSync(CURRENT_USER_KEY, JSON.stringify(data))
      }

      const statsRes = await Network.request({ url: `/api/growth/stats/${parsed.id}` })
      const statsData = (statsRes?.data as any)?.data
      if (statsData) {
        setStats(statsData)
      }
    } catch (err) {
      console.error('加载数据失败:', err)
    }
  }

  useLoad(() => {
    loadData()
  })

  const renderLevel = (level: { suns: number; moons: number; stars: number }) => {
    const icons: JSX.Element[] = []
    for (let i = 0; i < level.suns; i++) {
      icons.push(<Sun key={`sun-${i}`} size={24} color="#f59e0b" />)
    }
    for (let i = 0; i < level.moons; i++) {
      icons.push(<Moon key={`moon-${i}`} size={24} color="#6366f1" />)
    }
    for (let i = 0; i < level.stars; i++) {
      icons.push(<Star key={`star-${i}`} size={24} color="#f59e0b" />)
    }
    if (icons.length === 0) {
      return <Star size={24} color="#d1d5db" />
    }
    return <View className="flex flex-row items-center gap-1 flex-wrap">{icons}</View>
  }

  const getLevelText = (level: { suns: number; moons: number; stars: number }) => {
    const parts: string[] = []
    if (level.suns > 0) parts.push(`${level.suns}☀️`)
    if (level.moons > 0) parts.push(`${level.moons}🌙`)
    if (level.stars > 0) parts.push(`${level.stars}⭐`)
    return parts.join(' ') || '暂无等级'
  }

  if (!user) {
    return (
      <View className="flex flex-col items-center justify-center h-screen bg-white">
        <Text className="block text-gray-400">加载中...</Text>
      </View>
    )
  }

  return (
    <View className="flex flex-col min-h-screen bg-gray-50">
      {/* 顶部导航 */}
      <View className="bg-white px-4 pt-12 pb-4">
        <View className="flex flex-row items-center gap-3 mb-4">
          <View onClick={() => Taro.navigateBack()}>
            <ArrowLeft size={20} color="#666" />
          </View>
          <Text className="block text-lg font-semibold text-gray-800">个人中心</Text>
        </View>

        {/* 用户头像与名称 */}
        <View className="flex flex-row items-center gap-4">
          <View className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center">
            <User size={32} color="#3b82f6" />
          </View>
          <View>
            <Text className="block text-xl font-bold text-gray-800">{user.username}</Text>
            <Text className="block text-xs text-gray-400 mt-1">
              注册于 {user.created_at?.split('T')[0] || '-'}
            </Text>
          </View>
        </View>
      </View>

      {/* 等级展示 */}
      <Card className="mx-4 mt-4">
        <CardContent className="p-4">
          <View className="flex flex-row items-center gap-2 mb-3">
            <Award size={18} color="#f59e0b" />
            <Text className="block text-sm font-semibold text-gray-700">当前等级</Text>
          </View>
          <View className="flex flex-row items-center justify-between">
            {renderLevel(user.level)}
            <Text className="block text-sm text-gray-500">{getLevelText(user.level)}</Text>
          </View>
          <View className="mt-3 pt-3 border-t border-gray-100">
            <Text className="block text-xs text-gray-400">
              累计掌握 <Text className="text-blue-500 font-semibold">{user.masteredWords}</Text> 个单词
              · 升级规则：10⭐ = 1🌙，10🌙 = 1☀️
            </Text>
          </View>
        </CardContent>
      </Card>

      {/* 积分信息 */}
      <Card className="mx-4 mt-3">
        <CardContent className="p-4">
          <View className="flex flex-row items-center gap-2 mb-3">
            <TrendingUp size={18} color="#22c55e" />
            <Text className="block text-sm font-semibold text-gray-700">积分概览</Text>
          </View>
          <View className="flex flex-row justify-between">
            <View className="flex flex-col items-center flex-1">
              <Text className="block text-2xl font-bold text-blue-500">{user.points}</Text>
              <Text className="block text-xs text-gray-400 mt-1">当前余额</Text>
            </View>
            <View className="w-px bg-gray-200" />
            <View className="flex flex-col items-center flex-1">
              <Text className="block text-lg font-semibold text-green-500">{stats?.totalEarned ?? '-'}</Text>
              <Text className="block text-xs text-gray-400 mt-1">累计获取</Text>
            </View>
            <View className="w-px bg-gray-200" />
            <View className="flex flex-col items-center flex-1">
              <Text className="block text-lg font-semibold text-orange-500">{stats?.totalSpent ?? '-'}</Text>
              <Text className="block text-xs text-gray-400 mt-1">累计消耗</Text>
            </View>
          </View>
        </CardContent>
      </Card>

      {/* 快捷操作 */}
      <View className="px-4 mt-4">
        <Button
          className="w-full bg-amber-500 text-white rounded-xl py-3"
          onClick={() => Taro.navigateTo({ url: '/pages/points/index' })}
        >
          积分管理（兑换 / 明细）
        </Button>
      </View>
    </View>
  )
}
