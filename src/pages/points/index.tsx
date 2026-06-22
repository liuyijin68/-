import { useState } from 'react'
import { View, Text } from '@tarojs/components'
import Taro, { useLoad } from '@tarojs/taro'
import { Network } from '@/network'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, Coins, TrendingDown, Clock, Gift } from 'lucide-react-taro'

interface PointsRecord {
  id: number
  type: 'earn' | 'spend'
  amount: number
  reason: string
  created_at: string
}

const CURRENT_USER_KEY = 'current_user'

export default function PointsPage() {
  const [userId, setUserId] = useState<number>(0)
  const [balance, setBalance] = useState(0)
  const [history, setHistory] = useState<PointsRecord[]>([])
  const [showSpend, setShowSpend] = useState(false)
  const [spendAmount, setSpendAmount] = useState('')
  const [spendReason, setSpendReason] = useState('')
  const [loading, setLoading] = useState(false)
  const [stats, setStats] = useState<{ totalEarned: number; totalSpent: number }>({ totalEarned: 0, totalSpent: 0 })

  const loadData = async () => {
    try {
      const stored = Taro.getStorageSync(CURRENT_USER_KEY)
      if (!stored) {
        Taro.showToast({ title: '请先选择用户', icon: 'none' })
        setTimeout(() => Taro.navigateBack(), 1000)
        return
      }
      const parsed = typeof stored === 'string' ? JSON.parse(stored) : stored
      setUserId(parsed.id)

      // 加载用户信息
      const userRes = await Network.request({ url: `/api/growth/user/${parsed.id}` })
      const userData = (userRes?.data as any)?.data
      if (userData) {
        setBalance(userData.points)
      }

      // 加载积分历史
      const histRes = await Network.request({ url: `/api/growth/history/${parsed.id}` })
      const histData = (histRes?.data as any)?.data
      if (Array.isArray(histData)) {
        setHistory(histData)
      }

      // 加载统计
      const statsRes = await Network.request({ url: `/api/growth/stats/${parsed.id}` })
      const statsData = (statsRes?.data as any)?.data
      if (statsData) {
        setStats({ totalEarned: statsData.totalEarned, totalSpent: statsData.totalSpent })
      }
    } catch (err) {
      console.error('加载数据失败:', err)
    }
  }

  useLoad(() => {
    loadData()
  })

  // 消耗积分
  const handleSpend = async () => {
    const amount = parseInt(spendAmount, 10)
    if (!amount || amount <= 0) {
      Taro.showToast({ title: '请输入有效积分数量', icon: 'none' })
      return
    }
    if (!spendReason.trim()) {
      Taro.showToast({ title: '请输入兑换原因', icon: 'none' })
      return
    }
    if (amount > balance) {
      Taro.showToast({ title: '积分不足', icon: 'none' })
      return
    }
    setLoading(true)
    try {
      const res = await Network.request({
        url: '/api/growth/spend',
        method: 'POST',
        data: { userId, amount, reason: spendReason.trim() },
      })
      const data = (res?.data as any)?.data
      if (data) {
        Taro.showToast({ title: `成功消耗 ${amount} 积分`, icon: 'success' })
        setBalance(data.points)
        setSpendAmount('')
        setSpendReason('')
        setShowSpend(false)
        loadData()
      } else {
        Taro.showToast({ title: (res?.data as any)?.msg || '操作失败', icon: 'none' })
      }
    } catch (err) {
      Taro.showToast({ title: '操作失败，请重试', icon: 'none' })
    } finally {
      setLoading(false)
    }
  }

  const formatTime = (iso: string) => {
    if (!iso) return '-'
    return iso.replace('T', ' ').substring(0, 19)
  }

  return (
    <View className="flex flex-col min-h-screen bg-gray-50">
      {/* 顶部导航 */}
      <View className="bg-white px-4 pt-12 pb-4">
        <View className="flex flex-row items-center gap-3 mb-4">
          <View onClick={() => Taro.navigateBack()}>
            <ArrowLeft size={20} color="#666" />
          </View>
          <Text className="block text-lg font-semibold text-gray-800">积分管理</Text>
        </View>

        {/* 积分余额卡片 */}
        <View className="bg-gradient-to-r from-amber-400 to-orange-400 rounded-2xl p-4">
          <View className="flex flex-row items-center gap-2 mb-1">
            <Coins size={18} color="#fff" />
            <Text className="block text-white text-sm">当前积分余额</Text>
          </View>
          <Text className="block text-white text-4xl font-bold">{balance}</Text>
          <View className="flex flex-row gap-4 mt-2">
            <Text className="block text-white opacity-80 text-xs">累计获取 {stats.totalEarned}</Text>
            <Text className="block text-white opacity-80 text-xs">累计消耗 {stats.totalSpent}</Text>
          </View>
        </View>
      </View>

      {/* 操作区 */}
      <View className="px-4 mt-4">
        {!showSpend ? (
          <Button
            className="w-full bg-orange-500 text-white rounded-xl py-3"
            onClick={() => setShowSpend(true)}
          >
            <Gift size={18} color="#fff" />
            <Text className="block text-white ml-1">积分兑换（消耗积分）</Text>
          </Button>
        ) : (
          <Card>
            <CardContent className="p-4">
              <Text className="block text-sm font-semibold text-gray-700 mb-3">积分兑换</Text>
              <View className="mb-3">
                <Text className="block text-xs text-gray-500 mb-1">消耗积分数量</Text>
                <Input
                  className="bg-gray-50 rounded-xl border-gray-200"
                  type="number"
                  placeholder="输入积分数量"
                  value={spendAmount}
                  onInput={(e) => setSpendAmount(e.detail.value)}
                />
              </View>
              <View className="mb-3">
                <Text className="block text-xs text-gray-500 mb-1">兑换原因</Text>
                <Input
                  className="bg-gray-50 rounded-xl border-gray-200"
                  placeholder="如：兑换文具、兑换贴纸..."
                  value={spendReason}
                  onInput={(e) => setSpendReason(e.detail.value)}
                  maxlength={100}
                />
              </View>
              <View className="flex flex-row gap-2">
                <Button
                  className="flex-1 bg-gray-200 text-gray-600 rounded-xl py-2"
                  onClick={() => { setShowSpend(false); setSpendAmount(''); setSpendReason('') }}
                >
                  取消
                </Button>
                <Button
                  className="flex-1 bg-orange-500 text-white rounded-xl py-2"
                  onClick={handleSpend}
                  disabled={loading || !spendAmount || !spendReason.trim()}
                >
                  {loading ? '处理中...' : '确认兑换'}
                </Button>
              </View>
            </CardContent>
          </Card>
        )}
      </View>

      {/* 积分明细 */}
      <View className="flex-1 px-4 mt-4">
        <View className="flex flex-row items-center gap-2 mb-3">
          <Clock size={16} color="#9ca3af" />
          <Text className="block text-sm font-semibold text-gray-600">积分明细</Text>
        </View>

        {history.length === 0 ? (
          <View className="flex flex-col items-center justify-center py-12">
            <Coins size={40} color="#d1d5db" />
            <Text className="block text-gray-400 mt-2">暂无积分记录</Text>
            <Text className="block text-gray-300 text-xs mt-1">完成听写可获得积分</Text>
          </View>
        ) : (
          <View className="flex flex-col gap-2 pb-6">
            {history.map((record) => (
              <Card key={record.id}>
                <CardContent className="p-3">
                  <View className="flex flex-row items-center justify-between">
                    <View className="flex flex-row items-center gap-2 flex-1">
                      {record.type === 'earn' ? (
                        <View className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                          <TrendingDown size={14} color="#22c55e" style={{ transform: 'rotate(180deg)' }} />
                        </View>
                      ) : (
                        <View className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0">
                          <TrendingDown size={14} color="#f97316" />
                        </View>
                      )}
                      <View className="flex-1 min-w-0">
                        <Text className="block text-sm text-gray-700 truncate">{record.reason}</Text>
                        <Text className="block text-xs text-gray-400">{formatTime(record.created_at)}</Text>
                      </View>
                    </View>
                    <Badge variant={record.type === 'earn' ? 'default' : 'destructive'} className="flex-shrink-0 ml-2">
                      {record.type === 'earn' ? '+' : '-'}{record.amount}
                    </Badge>
                  </View>
                </CardContent>
              </Card>
            ))}
          </View>
        )}
      </View>
    </View>
  )
}
