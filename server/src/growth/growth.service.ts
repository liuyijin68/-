import { Injectable } from '@nestjs/common';
import { getSupabaseClient } from '../storage/database/supabase-client';

export interface LevelInfo {
  princesses: number;
  girls: number;
  suns: number;
  moons: number;
  stars: number;
}

export interface UserInfo {
  id: number;
  username: string;
  points: number;
  masteredWords: number;
  level: LevelInfo;
  created_at: string;
}

export interface PointsRecord {
  id: number;
  type: 'earn' | 'spend';
  amount: number;
  reason: string;
  created_at: string;
}

export interface EarnResult {
  points: number;
  masteredWords: number;
  level: LevelInfo;
  upgradeBonus: number;
  upgradeReason: string;
}

@Injectable()
export class GrowthService {
  /** 等级：每10星=1月，每10月=1太阳，每10太阳=1女孩，每10女孩=1公主 */
  calcLevel(mastered: number): LevelInfo {
    const stars = mastered % 10;
    const moons = Math.floor(mastered / 10) % 10;
    const suns = Math.floor(mastered / 100) % 10;
    const girls = Math.floor(mastered / 1000) % 10;
    const princesses = Math.floor(mastered / 10000);
    return { princesses, girls, suns, moons, stars };
  }

  /** 格式化等级为可读字符串 */
  formatLevel(level: LevelInfo): string {
    const parts: string[] = [];
    if (level.princesses > 0) parts.push(`${level.princesses}👸`);
    if (level.girls > 0) parts.push(`${level.girls}👧`);
    if (level.suns > 0) parts.push(`${level.suns}☀️`);
    if (level.moons > 0) parts.push(`${level.moons}🌙`);
    if (level.stars > 0 || parts.length === 0) parts.push(`${level.stars}⭐`);
    return parts.join(' ');
  }

  /** 检查升级并计算奖励积分 */
  private checkUpgradeBonus(oldMastered: number, newMastered: number): { bonus: number; reason: string } {
    const oldLevel = this.calcLevel(oldMastered);
    const newLevel = this.calcLevel(newMastered);
    let bonus = 0;
    const reasons: string[] = [];

    // 每获得一个月亮 → +2
    if (newLevel.moons > oldLevel.moons || newLevel.suns > oldLevel.suns || newLevel.girls > oldLevel.girls || newLevel.princesses > oldLevel.princesses) {
      // 检查月亮
      const oldMoons = oldLevel.moons + oldLevel.suns * 10 + oldLevel.girls * 100 + oldLevel.princesses * 1000;
      const newMoons = newLevel.moons + newLevel.suns * 10 + newLevel.girls * 100 + newLevel.princesses * 1000;
      const moonDiff = newMoons - oldMoons;
      if (moonDiff > 0) {
        bonus += moonDiff * 2;
        reasons.push(`${moonDiff}个月亮`);
      }
    }

    // 每获得一个太阳 → +20（但已算过月亮奖励，这里只算太阳的额外部分）
    const oldSuns = oldLevel.suns + oldLevel.girls * 10 + oldLevel.princesses * 100;
    const newSuns = newLevel.suns + newLevel.girls * 10 + newLevel.princesses * 100;
    const sunDiff = newSuns - oldSuns;
    if (sunDiff > 0) {
      bonus += sunDiff * 20;
      reasons.push(`${sunDiff}个太阳`);
    }

    // 每获得一个女孩 → +200
    const oldGirls = oldLevel.girls + oldLevel.princesses * 10;
    const newGirls = newLevel.girls + newLevel.princesses * 10;
    const girlDiff = newGirls - oldGirls;
    if (girlDiff > 0) {
      bonus += girlDiff * 200;
      reasons.push(`${girlDiff}个小女孩`);
    }

    // 每获得一个公主 → +2000
    const princessDiff = newLevel.princesses - oldLevel.princesses;
    if (princessDiff > 0) {
      bonus += princessDiff * 2000;
      reasons.push(`${princessDiff}个公主`);
    }

    return { bonus, reason: reasons.length > 0 ? reasons.join('、') : '' };
  }

  /** 注册用户 */
  async register(username: string): Promise<UserInfo> {
    const client = getSupabaseClient();
    const trimmed = username.trim();
    if (!trimmed || trimmed.length > 50) {
      throw new Error('用户名长度需在1-50字符之间');
    }

    const { data: existing } = await client.from('users').select('id').eq('username', trimmed).maybeSingle();
    if (existing) {
      throw new Error('该用户名已被注册');
    }

    const { data: user, error: userErr } = await client.from('users').insert({ username: trimmed }).select().single();
    if (userErr) throw new Error(`创建用户失败: ${userErr.message}`);

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

  /** 获取积分（掌握单词），含升级奖励 */
  async earnPoints(userId: number, word: string): Promise<EarnResult> {
    const client = getSupabaseClient();

    const { data: progress, error: progErr } = await client.from('user_progress').select('*').eq('user_id', userId).maybeSingle();
    if (progErr) throw new Error(`查询进度失败: ${progErr.message}`);
    if (!progress) throw new Error('用户进度不存在');

    const oldMastered = progress.mastered_words;
    const newMastered = oldMastered + 1;

    // 检查升级奖励
    const { bonus, reason } = this.checkUpgradeBonus(oldMastered, newMastered);
    const newPoints = progress.points + 1 + bonus;

    const { error: updateErr } = await client.from('user_progress')
      .update({ points: newPoints, mastered_words: newMastered, updated_at: new Date().toISOString() })
      .eq('user_id', userId);
    if (updateErr) throw new Error(`更新进度失败: ${updateErr.message}`);

    // 记录基础积分
    await client.from('points_history').insert({
      user_id: userId,
      type: 'earn',
      amount: 1,
      reason: `掌握单词: ${word}`,
    });

    // 如果有升级奖励，单独记录
    if (bonus > 0) {
      await client.from('points_history').insert({
        user_id: userId,
        type: 'earn',
        amount: bonus,
        reason: `升级奖励: ${reason}`,
      });
    }

    return {
      points: newPoints,
      masteredWords: newMastered,
      level: this.calcLevel(newMastered),
      upgradeBonus: bonus,
      upgradeReason: reason,
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

    const { data: earnRows, error: earnErr } = await client.from('points_history')
      .select('amount')
      .eq('user_id', userId)
      .eq('type', 'earn');
    if (earnErr) throw new Error(`统计失败: ${earnErr.message}`);
    const totalEarned = (earnRows || []).reduce((sum, r) => sum + r.amount, 0);

    const { data: spendRows, error: spendErr } = await client.from('points_history')
      .select('amount')
      .eq('user_id', userId)
      .eq('type', 'spend');
    if (spendErr) throw new Error(`统计失败: ${spendErr.message}`);
    const totalSpent = (spendRows || []).reduce((sum, r) => sum + r.amount, 0);

    return { totalEarned, totalSpent, balance };
  }
}
