import { Injectable } from '@nestjs/common';
import { getSupabaseClient } from '../storage/database/supabase-client';

export interface UserInfo {
  id: number;
  username: string;
  points: number;
  masteredWords: number;
  level: { suns: number; moons: number; stars: number };
  created_at: string;
}

export interface PointsRecord {
  id: number;
  type: 'earn' | 'spend';
  amount: number;
  reason: string;
  created_at: string;
}

@Injectable()
export class GrowthService {
  /** 计算等级：每10星=1月，每10月=1太阳 */
  calcLevel(mastered: number): { suns: number; moons: number; stars: number } {
    const stars = mastered % 10;
    const moons = Math.floor(mastered / 10) % 10;
    const suns = Math.floor(mastered / 100);
    return { suns, moons, stars };
  }

  /** 注册用户 */
  async register(username: string): Promise<UserInfo> {
    const client = getSupabaseClient();
    const trimmed = username.trim();
    if (!trimmed || trimmed.length > 50) {
      throw new Error('用户名长度需在1-50字符之间');
    }

    // 检查是否已存在
    const { data: existing } = await client.from('users').select('id').eq('username', trimmed).maybeSingle();
    if (existing) {
      throw new Error('该用户名已被注册');
    }

    // 创建用户
    const { data: user, error: userErr } = await client.from('users').insert({ username: trimmed }).select().single();
    if (userErr) throw new Error(`创建用户失败: ${userErr.message}`);

    // 创建进度记录
    const { error: progErr } = await client.from('user_progress').insert({
      user_id: user.id,
      points: 0,
      mastered_words: 0,
    });
    if (progErr) throw new Error(`创建进度失败: ${progErr.message}`);

    return {
      id: user.id,
      username: user.username,
      points: 0,
      masteredWords: 0,
      level: this.calcLevel(0),
      created_at: user.created_at,
    };
  }

  /** 获取所有用户 */
  async listUsers(): Promise<UserInfo[]> {
    const client = getSupabaseClient();
    const { data: users, error } = await client.from('users').select('*').order('id');
    if (error) throw new Error(`查询用户失败: ${error.message}`);

    const userIds = users.map(u => u.id);
    if (userIds.length === 0) return [];

    const { data: progresses, error: progErr } = await client.from('user_progress').select('*').in('user_id', userIds);
    if (progErr) throw new Error(`查询进度失败: ${progErr.message}`);

    const progressMap = new Map<number, any>();
    for (const p of progresses || []) {
      progressMap.set(p.user_id, p);
    }

    return users.map(u => {
      const p = progressMap.get(u.id) || { points: 0, mastered_words: 0 };
      return {
        id: u.id,
        username: u.username,
        points: p.points,
        masteredWords: p.mastered_words,
        level: this.calcLevel(p.mastered_words),
        created_at: u.created_at,
      };
    });
  }

  /** 获取单个用户信息 */
  async getUser(userId: number): Promise<UserInfo> {
    const client = getSupabaseClient();
    const { data: user, error } = await client.from('users').select('*').eq('id', userId).single();
    if (error) throw new Error(`用户不存在: ${error.message}`);

    const { data: progress } = await client.from('user_progress').select('*').eq('user_id', userId).maybeSingle();

    return {
      id: user.id,
      username: user.username,
      points: progress?.points ?? 0,
      masteredWords: progress?.mastered_words ?? 0,
      level: this.calcLevel(progress?.mastered_words ?? 0),
      created_at: user.created_at,
    };
  }

  /** 获取积分（掌握单词） */
  async earnPoints(userId: number, word: string): Promise<{ points: number; masteredWords: number; level: { suns: number; moons: number; stars: number } }> {
    const client = getSupabaseClient();

    // 更新进度：积分+1，掌握数+1
    const { data: progress, error: progErr } = await client.from('user_progress').select('*').eq('user_id', userId).maybeSingle();
    if (progErr) throw new Error(`查询进度失败: ${progErr.message}`);
    if (!progress) throw new Error('用户进度不存在');

    const newPoints = progress.points + 1;
    const newMastered = progress.mastered_words + 1;

    const { error: updateErr } = await client.from('user_progress')
      .update({ points: newPoints, mastered_words: newMastered, updated_at: new Date().toISOString() })
      .eq('user_id', userId);
    if (updateErr) throw new Error(`更新进度失败: ${updateErr.message}`);

    // 记录积分历史
    await client.from('points_history').insert({
      user_id: userId,
      type: 'earn',
      amount: 1,
      reason: `掌握单词: ${word}`,
    });

    return {
      points: newPoints,
      masteredWords: newMastered,
      level: this.calcLevel(newMastered),
    };
  }

  /** 消耗积分（兑换） */
  async spendPoints(userId: number, amount: number, reason: string): Promise<{ points: number; masteredWords: number }> {
    const client = getSupabaseClient();
    if (amount <= 0) throw new Error('消耗积分必须大于0');

    const { data: progress, error: progErr } = await client.from('user_progress').select('*').eq('user_id', userId).maybeSingle();
    if (progErr) throw new Error(`查询进度失败: ${progErr.message}`);
    if (!progress) throw new Error('用户进度不存在');
    if (progress.points < amount) throw new Error('积分不足');

    const newPoints = progress.points - amount;

    const { error: updateErr } = await client.from('user_progress')
      .update({ points: newPoints, updated_at: new Date().toISOString() })
      .eq('user_id', userId);
    if (updateErr) throw new Error(`更新积分失败: ${updateErr.message}`);

    // 记录积分历史
    await client.from('points_history').insert({
      user_id: userId,
      type: 'spend',
      amount,
      reason,
    });

    return { points: newPoints, masteredWords: progress.mastered_words };
  }

  /** 积分历史 */
  async getPointsHistory(userId: number, limit = 50): Promise<PointsRecord[]> {
    const client = getSupabaseClient();
    const { data, error } = await client.from('points_history')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw new Error(`查询积分历史失败: ${error.message}`);
    return (data || []) as PointsRecord[];
  }

  /** 统计信息 */
  async getStats(userId: number): Promise<{ totalEarned: number; totalSpent: number; balance: number }> {
    const client = getSupabaseClient();

    const { data: progress } = await client.from('user_progress').select('points').eq('user_id', userId).maybeSingle();
    const balance = progress?.points ?? 0;

    // 统计总获取
    const { data: earnRows, error: earnErr } = await client.from('points_history')
      .select('amount')
      .eq('user_id', userId)
      .eq('type', 'earn');
    if (earnErr) throw new Error(`统计失败: ${earnErr.message}`);
    const totalEarned = (earnRows || []).reduce((sum, r) => sum + r.amount, 0);

    // 统计总消耗
    const { data: spendRows, error: spendErr } = await client.from('points_history')
      .select('amount')
      .eq('user_id', userId)
      .eq('type', 'spend');
    if (spendErr) throw new Error(`统计失败: ${spendErr.message}`);
    const totalSpent = (spendRows || []).reduce((sum, r) => sum + r.amount, 0);

    return { totalEarned, totalSpent, balance };
  }
}
