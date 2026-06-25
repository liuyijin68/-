import { useState } from 'react'
import { View, Text } from '@tarojs/components'
import Taro, { useLoad, useDidShow } from '@tarojs/taro'
import { Network } from '@/network'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { ArrowLeft, User, Coins, TrendingUp, ChevronRight } from 'lucide-react-taro'

interface UserInfo {
  id: number
  username: string
  points: number
  masteredWords: number
  level: { princesses: number; girls: number; suns: number; moons: number; stars: number }
  created_at: string
}

export default function Profile() {
  const [user, setUser] = useState<UserInfo | null>(null)
  const [stats, setStats] = useState<{ totalEarned: number; totalSpent: number; balance: number } | null>(null)

  const loadData = async () => {
    const cached = Taro.getStorageSync('current_user')
    if (!cached?.id) {
      Taro.showToast({ title: '请先选择用户', icon: 'none' })
      setTimeout(() => Taro.navigateBack(), 1000)
      return
    }
    try {
      const res = await Network.request({
        url: `/api/growth/user/${cached.id}`,
        method: 'GET',
      })
      const data = (res?.data as any)?.data
      if (data) {
        setUser(data)
        Taro.setStorageSync('current_user', data)
      }
      const statsRes = await Network.request({
        url: `/api/growth/stats/${cached.id}`,
        method: 'GET',
      })
      const statsData = (statsRes?.data as any)?.data
      if (statsData) {
        setStats(statsData)
      }
    } catch (err) {
      console.error('加载用户信息失败:', err)
    }
  }

  useLoad(() => {
    loadData()
  })

  useDidShow(() => {
    loadData()
  })

  const renderLevelIcon = (level: UserInfo['level']) => {
    const parts: { icon: string; count: number; label: string }[] = []
    if (level.princesses > 0) parts.push({ icon: '👸', count: level.princesses, label: '公主' })
    if (level.girls > 0) parts.push({ icon: '👧', count: level.girls, label: '女孩' })
    if (level.suns > 0) parts.push({ icon: '☀️', count: level.suns, label: '太阳' })
    if (level.moons > 0) parts.push({ icon: '🌙', count: level.moons, label: '月亮' })
    if (level.stars > 0 || parts.length === 0) parts.push({ icon: '⭐', count: level.stars, label: '星星' })
    return parts
  }

  if (!user) {
    return (
      <View className="flex flex-col h-full bg-gray-50 items-center justify-center">
        <Text className="block text-gray-400">加载中...</Text>
      </View>
    )
  }

  const levelParts = renderLevelIcon(user.level)

  return (
    <View className="flex flex-col h-full bg-gray-50">
      {/* 顶部导航 */}
      <View className="bg-white px-4 py-3 flex flex-row items-center gap-3 border-b border-gray-100">
        <Button variant="ghost" size="sm" onClick={() => Taro.navigateBack()}>
          <ArrowLeft size={20} color="#666" />
        </Button>
        <Text className="block text-lg font-semibold text-gray-800">个人中心</Text>
      </View>

      <View className="flex-1 px-4 py-4 overflow-y-auto">
        {/* 用户信息卡片 */}
        <Card className="mb-4">
          <CardContent className="p-5 flex flex-col items-center">
            <View className="w-20 h-20 rounded-full bg-blue-100 flex items-center justify-center mb-3">
              <User size={40} color="#3b82f6" />
            </View>
            <Text className="block text-xl font-bold text-gray-800">{user.username}</Text>
            <Text className="block text-xs text-gray-400 mt-1">
              注册于 {user.created_at ? new Date(user.created_at).toLocaleDateString('zh-CN') : '-'}
            </Text>
          </CardContent>
        </Card>

        {/* 等级展示 */}
        <Card className="mb-4">
          <CardContent className="p-5">
            <View className="flex flex-row items-center gap-2 mb-3">
              <TrendingUp size={18} color="#f59e0b" />
              <Text className="block font-semibold text-gray-700">等级</Text>
            </View>
            <View className="flex flex-row flex-wrap gap-2">
              {levelParts.map((part, idx) => (
                <View key={idx} className="bg-amber-50 rounded-xl px-3 py-2 flex flex-row items-center gap-1">
                  <Text className="text-lg">{part.icon}</Text>
                  <Text className="text-sm font-semibold text-gray-700">×{part.count}</Text>
                </View>
              ))}
            </View>
            <Text className="block text-xs text-gray-400 mt-2">
              累计掌握 {user.masteredWords} 个单词
            </Text>
            {/* 等级说明 */}
            <View className="mt-3 bg-gray-50 rounded-lg p-3">
              <Text className="block text-xs text-gray-500">等级规则：</Text>
              <Text className="block text-xs text-gray-400">10⭐ = 1🌙 · 10🌙 = 1☀️ · 10☀️ = 1👧 · 10👧 = 1👸</Text>
              <Text className="block text-xs text-gray-400 mt-1">升级奖励：🌙+2分 · ☀️+20分 · 👧+200分 · 👸+2000分</Text>
            </View>
          </CardContent>
        </Card>

        {/* 积分概览 */}
        <Card className="mb-4">
          <CardContent className="p-5">
            <View className="flex flex-row items-center gap-2 mb-3">
              <Coins size={18} color="#f59e0b" />
              <Text className="block font-semibold text-gray-700">积分概览</Text>
            </View>
            <View className="flex flex-row justify-between">
              <View className="flex flex-col items-center flex-1">
                <Text className="block text-2xl font-bold text-amber-600">{user.points}</Text>
                <Text className="block text-xs text-gray-400">当前余额</Text>
              </View>
              <Separator orientation="vertical" className="h-10" />
              <View className="flex flex-col items-center flex-1">
                <Text className="block text-lg font-semibold text-green-600">{stats?.totalEarned || 0}</Text>
                <Text className="block text-xs text-gray-400">累计获取</Text>
              </View>
              <Separator orientation="vertical" className="h-10" />
              <View className="flex flex-col items-center flex-1">
                <Text className="block text-lg font-semibold text-red-500">{stats?.totalSpent || 0}</Text>
                <Text className="block text-xs text-gray-400">累计消耗</Text>
              </View>
            </View>
          </CardContent>
        </Card>

        {/* 快捷入口 */}
        <Card className="cursor-pointer active:opacity-80" onClick={() => Taro.navigateTo({ url: '/pages/points/index' })}>
          <CardContent className="p-4 flex flex-row items-center justify-between">
            <View className="flex flex-row items-center gap-3">
              <Coins size={20} color="#f59e0b" />
              <View>
                <Text className="block font-medium text-gray-800">积分管理</Text>
                <Text className="block text-xs text-gray-400">积分兑换、明细查询</Text>
              </View>
            </View>
            <ChevronRight size={16} color="#d1d5db" />
          </CardContent>
        </Card>
      </View>
    </View>
  )
}
